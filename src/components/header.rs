use dioxus::prelude::*;

#[component]
pub fn Header(
    time_str: String,
    location_name: String,
    wanted_stars: u8,
    on_toggle_stars: EventHandler<()>,
) -> Element {
    rsx! {
        div { class: "hud-meta-right",
            div { class: "hud-clock", "{time_str}" }
            div { class: "hud-location-name", "{location_name}" }
            div {
                class: "hud-wanted-stars",
                title: "Click to toggle Wanted Level",
                onclick: move |_| on_toggle_stars.call(()),
                for star_index in 1..=5 {
                    if star_index <= wanted_stars {
                        span { class: "star-active", "★" }
                    } else {
                        span { class: "star-inactive", "☆" }
                    }
                }
            }
        }
    }
}
