package io.github.wypiek.itter;

import android.app.NativeActivity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * The 3itter app is a NativeActivity: the whole UI is Rust (libitter.so). This subclass only adds
 * what a native activity can't do on its own: open the system file picker and receive its result.
 * The picked files are read here and handed to Rust (onPicked / onPickDone).
 */
public class MainActivity extends NativeActivity {
    private static final long MAX_BYTES = 60L * 1024 * 1024;

    /** Called from Rust. `mime` is "image/*" or "video/*"; `multiple` allows several images. */
    public void pickMedia(final String mime, final int requestCode, final boolean multiple) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.setType(mime);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                if (multiple) intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(Intent.createChooser(intent, null), requestCode);
                } catch (Exception e) {
                    onPickDone(requestCode);
                }
            }
        });
    }

    /** Called from Rust: open a link in the browser. */
    public void openUrl(final String url) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception e) { /* no browser */ }
            }
        });
    }

    /** Called from Rust: the system share sheet for a link or text. */
    public void shareText(final String text) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("text/plain");
                send.putExtra(Intent.EXTRA_TEXT, text);
                try { startActivity(Intent.createChooser(send, null)); } catch (Exception e) { /* nothing can share */ }
            }
        });
    }

    @Override
    protected void onActivityResult(final int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        final List<Uri> uris = new ArrayList<Uri>();
        if (resultCode == RESULT_OK && data != null) {
            ClipData clip = data.getClipData();
            if (clip != null) {
                for (int i = 0; i < clip.getItemCount(); i++) uris.add(clip.getItemAt(i).getUri());
            } else if (data.getData() != null) {
                uris.add(data.getData());
            }
        }
        // Read off the UI thread: videos can be tens of megabytes.
        new Thread(new Runnable() {
            @Override public void run() {
                for (Uri uri : uris) {
                    try {
                        String mime = getContentResolver().getType(uri);
                        InputStream in = getContentResolver().openInputStream(uri);
                        if (in == null) continue;
                        ByteArrayOutputStream out = new ByteArrayOutputStream();
                        byte[] buf = new byte[65536];
                        long total = 0;
                        int n;
                        while ((n = in.read(buf)) > 0) {
                            total += n;
                            if (total > MAX_BYTES) break;
                            out.write(buf, 0, n);
                        }
                        in.close();
                        if (total <= MAX_BYTES) onPicked(requestCode, mime == null ? "" : mime, out.toByteArray());
                    } catch (Exception e) {
                        // skip unreadable files
                    }
                }
                onPickDone(requestCode);
            }
        }).start();
    }

    private native void onPicked(int requestCode, String mime, byte[] data);
    private native void onPickDone(int requestCode);
}
