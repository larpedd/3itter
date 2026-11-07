#!/usr/bin/env bash
# Build a signed 3itter APK: the Rust library (UI in Slint, drawn with Skia) inside a NativeActivity.
#   TOOLCHAIN   folder with rust (rustup), jdk and the Android sdk + ndk  (default ~/.local/opt/android-build)
#   KEYSTORE    signing key, created on first run                      (default $TOOLCHAIN/3itter-release.jks)
#   ABIS        Android ABIs to include                                 (default "arm64-v8a")
set -euo pipefail
cd "$(dirname "$0")"
T=${TOOLCHAIN:-$HOME/.local/opt/android-build}
export RUSTUP_HOME=$T/rustup CARGO_HOME=$T/cargo JAVA_HOME=$T/jdk ANDROID_HOME=$T/sdk ANDROID_SDK_ROOT=$T/sdk
NDK=$ANDROID_HOME/ndk/$(ls "$ANDROID_HOME/ndk" | sort -V | tail -1)
export ANDROID_NDK_ROOT=$NDK ANDROID_NDK_HOME=$NDK NDK_HOME=$NDK
export PATH="$CARGO_HOME/bin:$JAVA_HOME/bin:$PATH"
BT=$ANDROID_HOME/build-tools/$(ls "$ANDROID_HOME/build-tools" | sort -V | tail -1)
PLATFORM=$ANDROID_HOME/platforms/$(ls "$ANDROID_HOME/platforms" | sort -V | tail -1)
LLVM=$NDK/toolchains/llvm/prebuilt/linux-x86_64
API=26
ABIS=${ABIS:-arm64-v8a}

declare -A TARGET=([arm64-v8a]=aarch64-linux-android [armeabi-v7a]=armv7-linux-androideabi [x86_64]=x86_64-linux-android)
declare -A CLANG=([arm64-v8a]=aarch64-linux-android [armeabi-v7a]=armv7a-linux-androideabi [x86_64]=x86_64-linux-android)

rm -rf build/apk && mkdir -p build/apk/lib dist
for abi in $ABIS; do
  target=${TARGET[$abi]}
  cc="$LLVM/bin/${CLANG[$abi]}$API-clang"
  env_target=$(echo "$target" | tr 'a-z-' 'A-Z_')
  rustup target add "$target" >/dev/null 2>&1 || true
  export "CARGO_TARGET_${env_target}_LINKER=$cc"
  export "CC_${target//-/_}=$cc" "CXX_${target//-/_}=$cc++" "AR_${target//-/_}=$LLVM/bin/llvm-ar"
  cargo build --release --lib --target "$target"
  mkdir -p "build/apk/lib/$abi"
  cp "target/$target/release/libitter.so" "build/apk/lib/$abi/"
  # Ship the C++ runtime if the library needs it (Skia does).
  if "$LLVM/bin/llvm-readelf" -d "build/apk/lib/$abi/libitter.so" | grep -q 'libc++_shared.so'; then
    cp "$LLVM/sysroot/usr/lib/${target/armv7/arm}/libc++_shared.so" "build/apk/lib/$abi/"
  fi
done

# The small Java part: MainActivity (a NativeActivity subclass for the file picker) -> classes.dex.
rm -rf build/classes build/dex && mkdir -p build/classes build/dex
javac --release 8 -nowarn -classpath "$PLATFORM/android.jar" -d build/classes $(find java -name '*.java') 2>&1 | grep -v "^warning\|^Note\|^1 warning" || true
"$BT/d8" --min-api $API --lib "$PLATFORM/android.jar" --output build/dex $(find build/classes -name '*.class')

# Resources and manifest -> base APK, then add the native libraries.
"$BT/aapt2" compile --dir res -o build/res.zip
"$BT/aapt2" link -o build/base.apk --manifest AndroidManifest.xml -I "$PLATFORM/android.jar" build/res.zip --auto-add-overlay
cp build/base.apk build/unaligned.apk
python3 - <<'PY'
import os, zipfile
with zipfile.ZipFile('build/unaligned.apk', 'a', zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk('build/apk/lib'):
        for f in files:
            full = os.path.join(root, f)
            z.write(full, os.path.relpath(full, 'build/apk'))
    z.write('build/dex/classes.dex', 'classes.dex')
PY
"$BT/zipalign" -f -P 16 4 build/unaligned.apk build/aligned.apk

KS=${KEYSTORE:-$T/3itter-release.jks}
PASSFILE=$KS.pass
if [ ! -f "$KS" ]; then
  head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' > "$PASSFILE"; chmod 600 "$PASSFILE"
  keytool -genkeypair -keystore "$KS" -alias 3itter -keyalg RSA -keysize 4096 -validity 10000 \
    -storepass "$(cat "$PASSFILE")" -keypass "$(cat "$PASSFILE")" -dname "CN=3itter, O=3itter" >/dev/null
  chmod 600 "$KS"
  echo "Created signing key $KS (password in $PASSFILE). Keep both safe: updates must be signed with the same key."
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass "file:$PASSFILE" --ks-key-alias 3itter --out dist/3itter.apk build/aligned.apk
rm -f dist/*.idsig
"$BT/apksigner" verify dist/3itter.apk && echo "APK: $(pwd)/dist/3itter.apk ($(du -h dist/3itter.apk | cut -f1))"
