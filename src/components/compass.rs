use dioxus::prelude::*;

#[component]
pub fn Compass(heading: f64) -> Element {
    let rounded_heading = (heading.round() as i32).rem_euclid(360);

    let cardinal_name = match rounded_heading {
        338..=359 | 0..=22 => "N",
        23..=67 => "NE",
        68..=112 => "E",
        113..=157 => "SE",
        158..=202 => "S",
        203..=247 => "SW",
        248..=292 => "W",
        293..=337 => "NW",
        _ => "N",
    };

    // Calculate dynamic sliding tape marks
    let tape_display = format!(
        "· · · {:03}° {} · · ·",
        rounded_heading, cardinal_name
    );

    rsx! {
        div { class: "compass-container",
            div { class: "compass-tape", "{tape_display}" }
            div { class: "compass-degrees", "HDG: {rounded_heading}°" }
        }
    }
}
