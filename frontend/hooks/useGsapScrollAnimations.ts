import { useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export default function useGsapScrollAnimations() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    gsap.registerPlugin(ScrollTrigger);

    // Reveal elements with fade and slide up
    gsap.utils.toArray<HTMLElement>(".reveal").forEach((el) => {
      gsap.from(el, {
        scrollTrigger: {
          trigger: el,
          start: "top 85%",
          end: "bottom 20%",
          toggleActions: "play none none reverse",
        },
        opacity: 0,
        y: 60,
        duration: 1.3,
        ease: "power2.out",
      });
    });

    // Parallax backgrounds - move slower than scroll
    gsap.utils.toArray<HTMLElement>(".parallax-bg").forEach((bg) => {
      gsap.to(bg, {
        yPercent: -20,
        ease: "none",
        scrollTrigger: {
          trigger: bg,
          scrub: true,
        },
      });
    });

    // Hero text fade in and slow zoom-out on scroll
    const heroText = document.querySelector(".hero-text");
    if (heroText) {
      gsap.to(heroText, {
        scrollTrigger: {
          trigger: heroText,
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
        scale: 0.95,
        opacity: 0.7,
        ease: "none",
      });
    }

    // Staggered reveal for planner form fields
    const formFields = document.querySelectorAll(".form-field");
    if (formFields.length > 0) {
      gsap.from(formFields, {
        scrollTrigger: {
          trigger: formFields[0],
          start: "top 85%",
        },
        opacity: 0,
        y: 40,
        duration: 1.2,
        stagger: 0.1,
        ease: "power2.out",
      });
    }

    // Mission section cards from bottom
    const missionCards = document.querySelectorAll(".mission-card");
    if (missionCards.length > 0) {
      gsap.from(missionCards, {
        scrollTrigger: {
          trigger: missionCards[0],
          start: "top 85%",
        },
        opacity: 0,
        y: 80,
        duration: 1.4,
        stagger: 0.15,
        ease: "power2.out",
      });
    }

    // Testimonials alternate from left/right
    const testimonialCards = document.querySelectorAll(".testimonial-card");
    if (testimonialCards.length > 0) {
      testimonialCards.forEach((card, index) => {
        const direction = index % 2 === 0 ? -100 : 100;
        gsap.from(card, {
          scrollTrigger: {
            trigger: card,
            start: "top 85%",
          },
          opacity: 0,
          x: direction,
          duration: 1.3,
          ease: "power2.out",
        });
      });
    }

    // Cleanup
    return () => {
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, []);
}

