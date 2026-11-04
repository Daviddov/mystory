"use client";

import { useSyncExternalStore } from "react";
import { useT } from "../i18n/LocaleProvider";

type GreetingKey = "morning" | "noon" | "evening" | "night" | "hello";

interface GreetingText {
  key: GreetingKey;
  emoji: string;
}

const MORNING: GreetingText = { key: "morning", emoji: "🌤️" };
const NOON: GreetingText = { key: "noon", emoji: "☀️" };
const EVENING: GreetingText = { key: "evening", emoji: "🌇" };
const NIGHT: GreetingText = { key: "night", emoji: "🌙" };
/** In the cached HTML, and until the browser knows the time. */
const NEUTRAL: GreetingText = { key: "hello", emoji: "👋" };

/** Greeting by the hour in Israel. */
export function greetingFor(now: Date): GreetingText {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Jerusalem" }).format(now),
  );
  if (hour >= 5 && hour < 12) return MORNING;
  if (hour >= 12 && hour < 17) return NOON;
  if (hour >= 17 && hour < 20) return EVENING;
  return NIGHT;
}

const subscribe = () => () => undefined;

/**
 * The home page is cached HTML, so the hour is only known in the browser:
 * the page arrives with a neutral "hello" and hydration swaps in the greeting.
 */
export function Greeting() {
  const { t } = useT();
  const greeting = useSyncExternalStore(
    subscribe,
    () => greetingFor(new Date()),
    () => NEUTRAL,
  );
  return (
    <>
      <span aria-hidden="true">{greeting.emoji}</span>
      {t.greeting[greeting.key]}
    </>
  );
}
