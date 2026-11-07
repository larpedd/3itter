//! Colour roles from one seed hue, using the same OKLCH values as public/css/tokens.css.

use slint::Color;

/// OKLCH (lightness 0–1, chroma, hue in degrees) to an sRGB colour.
pub fn oklch(l: f32, c: f32, h: f32) -> Color {
    let (a, b) = (c * h.to_radians().cos(), c * h.to_radians().sin());
    let l_ = l + 0.396_337_78 * a + 0.215_803_76 * b;
    let m_ = l - 0.105_561_35 * a - 0.063_854_17 * b;
    let s_ = l - 0.089_484_18 * a - 1.291_485_5 * b;
    let (l3, m3, s3) = (l_ * l_ * l_, m_ * m_ * m_, s_ * s_ * s_);
    let r = 4.076_741_7 * l3 - 3.307_711_6 * m3 + 0.230_969_94 * s3;
    let g = -1.268_438 * l3 + 2.609_757_4 * m3 - 0.341_319_4 * s3;
    let bl = -0.004_196_086 * l3 - 0.703_418_6 * m3 + 1.707_614_7 * s3;
    let gamma = |x: f32| {
        let x = x.clamp(0.0, 1.0);
        let v = if x <= 0.003_130_8 { 12.92 * x } else { 1.055 * x.powf(1.0 / 2.4) - 0.055 };
        (v * 255.0).round() as u8
    };
    Color::from_rgb_u8(gamma(r), gamma(g), gamma(bl))
}

/// Role order must match the `s[...]` indices in ui/theme.slint.
pub fn scheme(h: f32, dark: bool) -> Vec<Color> {
    let h2 = h + 60.0;
    let roles: [(f32, f32, f32); 23] = if !dark {
        [
            (0.50, 0.19, h), (1.0, 0.0, h), (0.91, 0.07, h), (0.32, 0.13, h),
            (0.915, 0.045, h), (0.31, 0.06, h),
            (0.955, 0.012, h), (0.966, 0.010, h), (0.950, 0.013, h), (0.935, 0.015, h), (0.915, 0.017, h),
            (0.21, 0.012, h), (0.43, 0.02, h), (0.60, 0.02, h), (0.86, 0.015, h),
            (0.53, 0.21, 27.0),
            (0.52, 0.15, h2), (0.91, 0.08, h2), (0.32, 0.12, h2),
            (0.30, 0.012, h), (0.95, 0.008, h),
            (0.60, 0.22, 10.0), (0.58, 0.15, 150.0),
        ]
    } else {
        [
            (0.82, 0.11, h), (0.30, 0.12, h), (0.40, 0.14, h), (0.92, 0.06, h),
            (0.37, 0.045, h), (0.91, 0.035, h),
            (0.17, 0.010, h), (0.20, 0.012, h), (0.22, 0.013, h), (0.255, 0.014, h), (0.29, 0.015, h),
            (0.93, 0.01, h), (0.80, 0.02, h), (0.63, 0.02, h), (0.38, 0.018, h),
            (0.80, 0.10, 25.0),
            (0.83, 0.10, h2), (0.42, 0.12, h2), (0.92, 0.06, h2),
            (0.92, 0.01, h), (0.28, 0.012, h),
            (0.74, 0.17, 10.0), (0.78, 0.14, 150.0),
        ]
    };
    roles.iter().map(|&(l, c, hh)| oklch(l, c, hh)).collect()
}

/// Avatar background and letter colour for a profile hue.
pub fn avatar_colors(hue: i64) -> (Color, Color) {
    let h = hue as f32;
    (oklch(0.86, 0.08, h), oklch(0.36, 0.12, h))
}

pub fn banner_color(hue: i64) -> Color {
    oklch(0.78, 0.11, hue as f32)
}
