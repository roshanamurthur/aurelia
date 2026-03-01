"use client";

import Chat from "@/app/components/Chat";
import DineOutReservationButton from "@/app/components/DineOutReservationButton";
import TakeoutOrderButton from "@/app/components/TakeoutOrderButton";
import { getCaloriesForSlot, getTakeoutCalories } from "@/lib/sfMeals";
import { getDefaultTimeForRestaurant } from "@/lib/sfRestaurants";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";

type ExpandedRecipe = { day: string; mealType: string } | null;
type FridgeItem = { id: string; label: string };

export default function MealPlanPage() {
  const { isLoading } = useConvexAuth();
  const rawActivePlan = useQuery(api.mealPlans.getActivePlan);
  // Dedicated meals subscription — independent reactive channel for meal changes
  const liveMeals = useQuery(api.mealPlans.watchActiveMeals);
  const currentUser = useQuery(api.preferences.currentUser);

  // Keep stable plan data during brief WebSocket re-subscriptions
  // (prevents "No meal plan" flash when connection hiccups)
  const stablePlanRef = useRef(rawActivePlan);
  if (rawActivePlan !== undefined) {
    stablePlanRef.current = rawActivePlan;
  }
  const activePlan = rawActivePlan !== undefined ? rawActivePlan : stablePlanRef.current;

  // Intake grace period: when arriving from ?from=intake, show a loading
  // state for up to 8s instead of "No meal plan yet" to let Convex propagate.
  const searchParams = useSearchParams();
  const router = useRouter();
  const isFromIntake = searchParams.get("from") === "intake";
  const [intakeGrace, setIntakeGrace] = useState(isFromIntake);

  useEffect(() => {
    if (!isFromIntake) return;
    const timer = setTimeout(() => setIntakeGrace(false), 8000);
    return () => clearTimeout(timer);
  }, [isFromIntake]);

  // Once activePlan arrives during grace period, clear the grace and clean URL
  useEffect(() => {
    if (intakeGrace && activePlan) {
      setIntakeGrace(false);
      router.replace("/meal-plan", { scroll: false });
    }
  }, [intakeGrace, activePlan, router]);

  // Prefer dedicated meals subscription (more granular reactivity),
  // fall back to activePlan.meals while liveMeals is still loading
  const currentMeals: any[] =
    liveMeals !== undefined
      ? (liveMeals ?? [])
      : (activePlan?.meals ?? []);
  const groceryList = useQuery(
    api.groceryList.get,
    activePlan?._id ? { mealPlanId: activePlan._id } : "skip"
  );
  const generateGroceryList = useMutation(api.groceryList.generate);
  const upsertMeal = useMutation(api.mealPlans.upsertMeal);
  const [chatOpen, setChatOpen] = useState(false);
  const [fridgeOpen, setFridgeOpen] = useState(true);
  const [expandedRecipe, setExpandedRecipe] = useState<ExpandedRecipe>(null);
  const [fridgeItems, setFridgeItems] = useState<FridgeItem[]>([]);
  const [fridgeInput, setFridgeInput] = useState("");
  const [groceryGenerating, setGroceryGenerating] = useState(false);
  const [instacartOrdering, setInstacartOrdering] = useState(false);
  const [instacartResult, setInstacartResult] = useState<string | null>(null);
  const [instacartError, setInstacartError] = useState<string | null>(null);
  const [selectedGroceryIndices, setSelectedGroceryIndices] = useState<Set<number>>(new Set());
  // Optimistic takeout overrides: when user switches meal, use this for calories immediately (key: "day-mealType")
  const [pendingTakeoutOverrides, setPendingTakeoutOverrides] = useState<Record<string, string>>({});
  // Schedule all: status per slot (key: dateStr-planDayName-mealType), shown inline on cards
  type ScheduleSlotStatus = "ordering" | "success" | "error";
  const [scheduleAllStatus, setScheduleAllStatus] = useState<
    Record<
      string,
      {
        status: ScheduleSlotStatus;
        progressMessage?: string;
        liveUrl?: string;
        scheduledFor?: string;
        error?: string;
      }
    >
  >({});
  const [scheduleToast, setScheduleToast] = useState<{ success: number; failed: number } | null>(null);
  // Removed addingDineOut state — test button was hardcoded dev tool

  useEffect(() => {
    setSelectedGroceryIndices(new Set());
  }, [groceryList?.items?.length]);

  // Show loading indicator while auth or initial query is loading
  // (but NOT during WebSocket re-subscriptions — stablePlanRef covers that)
  if (isLoading || (rawActivePlan === undefined && stablePlanRef.current === undefined)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex gap-2">
          <span className="w-2 h-2 bg-black animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 bg-black animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 bg-black animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    );
  }

  const mealTypes = ["breakfast", "lunch", "dinner"] as const;

  // Rolling 7-day window: today + next 6 days (not fixed Mon–Sun)
  const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
  const getDayName = (d: Date) => DAY_NAMES[d.getDay()]!;

  const getRollingDays = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const out: { date: Date; label: string; dayName: string; planDayName: string | null }[] = [];
    const weekStart = activePlan?.weekStartDate
      ? new Date(activePlan.weekStartDate + "T00:00:00")
      : null;
    const weekEnd = weekStart ? new Date(weekStart) : null;
    if (weekEnd) weekEnd.setDate(weekEnd.getDate() + 6);

    // Show the plan's full Mon-Sun week whenever today falls within (or
    // before) the plan range. This prevents the rolling window from
    // overrunning the plan end and showing "Not planned" for days that
    // have meals in the database.
    const windowStart =
      weekStart && weekEnd && today <= weekEnd ? weekStart : today;

    for (let i = 0; i < 7; i++) {
      const d = new Date(windowStart);
      d.setDate(d.getDate() + i);
      const dayName = getDayName(d);
      const label =
        d.toLocaleDateString("en-US", { weekday: "short" }) +
        " " +
        d.getDate();
      const inPlan =
        weekStart &&
        weekEnd &&
        d >= weekStart &&
        d <= weekEnd;
      out.push({
        date: d,
        label,
        dayName,
        planDayName: inPlan ? dayName : null,
      });
    }
    return out;
  };

  const rollingDays = getRollingDays();
  const todayDayName = getDayName(new Date());

  const getMeal = (day: string, mealType: string) => {
    if (!currentMeals.length) return null;
    return currentMeals.find(
      (m: any) => m.day === day && m.mealType === mealType && !m.isSkipped
    );
  };

  const getDayCalories = (planDayName: string | null, slotDayName: string, dateStr?: string) => {
    let total = 0;
    for (const mealType of mealTypes) {
      const slotKey = planDayName && dateStr ? `${dateStr}-${planDayName}-${mealType}` : planDayName ? `${planDayName}-${mealType}` : null;
      const overrideMeal = slotKey ? pendingTakeoutOverrides[slotKey] : null;
      if (overrideMeal) {
        total += getTakeoutCalories(overrideMeal) ?? 0;
      } else {
        const meal = planDayName ? getMeal(planDayName, mealType) : null;
        if (meal) {
          const cal = meal.calories ?? (meal.isTakeout ? getTakeoutCalories(meal.recipeName) : undefined);
          total += cal ?? 0;
        } else {
          total += getCaloriesForSlot(slotDayName, mealType) ?? 0;
        }
      }
    }
    return total;
  };

  const addFridgeItems = (getCanonicalKey?: (name: string) => string) => {
    const labels = fridgeInput
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (labels.length === 0) return;
    const existingLabels = new Set(fridgeItems.map((i) => i.label.toLowerCase()));
    const existingCanonical = getCanonicalKey
      ? new Set(fridgeItems.map((i) => getCanonicalKey(i.label)))
      : null;
    const newItems: FridgeItem[] = labels
      .filter((label) => {
        if (existingLabels.has(label.toLowerCase())) return false;
        if (existingCanonical && getCanonicalKey) {
          const key = getCanonicalKey(label);
          if (existingCanonical.has(key)) return false;
        }
        return true;
      })
      .map((label) => ({ id: `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`, label }));
    setFridgeItems((prev) => [...prev, ...newItems]);
    setFridgeInput("");
  };

  const removeFridgeItem = (id: string) => {
    setFridgeItems((prev) => prev.filter((i) => i.id !== id));
  };

  // Collect takeout/dine-out meals from the rolling window for Schedule All
  type TakeoutSlot = {
    slotKey: string;
    recipeName: string;
    service: "doordash" | "opentable";
    dateStr?: string;
    defaultTime?: string;
  };
  const getTakeoutMealsForSchedule = (): TakeoutSlot[] => {
    if (!currentMeals.length) return [];
    const items: TakeoutSlot[] = [];
    for (const { date, planDayName } of rollingDays) {
      if (!planDayName) continue;
      const dateStr = date.toISOString().slice(0, 10);
      for (const mealType of mealTypes) {
        const meal = getMeal(planDayName, mealType);
        if (meal?.isTakeout) {
          const service = (meal.takeoutService === "opentable" ? "opentable" : "doordash") as "doordash" | "opentable";
          items.push({
            slotKey: `${dateStr}-${planDayName}-${mealType}`,
            recipeName: meal.recipeName,
            service,
            ...(service === "opentable" && { dateStr, defaultTime: meal.takeoutDetails ?? "19:00" }),
          });
        }
      }
    }
    return items;
  };

  const takeoutSlotsForSchedule = getTakeoutMealsForSchedule();
  const scheduleProgress = (() => {
    const total = takeoutSlotsForSchedule.length;
    if (total === 0) return null;
    const slotKeys = new Set(takeoutSlotsForSchedule.map((i) => i.slotKey));
    let done = 0;
    let ordering = 0;
    for (const key of slotKeys) {
      const s = scheduleAllStatus[key];
      if (s?.status === "success" || s?.status === "error") done++;
      else if (s?.status === "ordering") ordering++;
    }
    return { total, done, ordering };
  })();

  const toFriendlyProgress = (raw: string): string => {
    const lower = (raw || "").toLowerCase();
    if (lower.includes("search") || lower.includes("finding")) return "Searching for item...";
    if (lower.includes("restaurant") || (lower.includes("click") && lower.includes("first")))
      return "Opening restaurant...";
    if (lower.includes("add") && (lower.includes("cart") || lower.includes("menu")))
      return "Adding to cart...";
    if (raw && raw.length > 50) return raw.slice(0, 47) + "...";
    return raw || "Working...";
  };

  const handleScheduleAll = async () => {
    const items = getTakeoutMealsForSchedule();
    if (items.length === 0) return;

    setScheduleAllStatus(
      Object.fromEntries(
        items.map((i) => [i.slotKey, { status: "ordering" as ScheduleSlotStatus, progressMessage: "Starting..." }])
      )
    );
    setScheduleToast(null);

    const getScheduledFor = () => {
      const d = new Date();
      d.setMinutes(d.getMinutes() + 35);
      return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    };

    const results = await Promise.all(
      items.map(async ({ slotKey, recipeName, service, dateStr: slotDateStr, defaultTime: slotDefaultTime }): Promise<"success" | "error"> => {
        try {
          if (service === "opentable") {
            const res = await fetch("/api/opentable", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                restaurantName: recipeName,
                location: "San Francisco",
                date: slotDateStr ?? "",
                time: slotDefaultTime ?? "19:00",
                partySize: 2,
                stream: true,
              }),
            });
            const contentType = res.headers.get("content-type") ?? "";
            if (contentType.includes("text/event-stream")) {
              const reader = res.body?.getReader();
              const decoder = new TextDecoder();
              if (!reader) throw new Error("No response body");
              let buffer = "";
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n\n");
                buffer = lines.pop() ?? "";
                for (const line of lines) {
                  if (!line.startsWith("data: ")) continue;
                  try {
                    const data = JSON.parse(line.slice(6));
                    if (data.type === "step") {
                      setScheduleAllStatus((prev) => ({
                        ...prev,
                        [slotKey]: {
                          ...prev[slotKey],
                          status: "ordering",
                          progressMessage: data.message ?? "Making reservation...",
                        },
                      }));
                    } else if (data.type === "done") {
                      setScheduleAllStatus((prev) => ({
                        ...prev,
                        [slotKey]: {
                          status: "success",
                          liveUrl: data.liveUrl,
                          scheduledFor: getScheduledFor(),
                        },
                      }));
                      return "success";
                    } else if (data.type === "error") {
                      setScheduleAllStatus((prev) => ({
                        ...prev,
                        [slotKey]: {
                          status: "error",
                          error: data.error ?? data.output ?? "Reservation failed",
                        },
                      }));
                      return "error";
                    }
                  } catch (e) {
                    if (e instanceof SyntaxError) continue;
                    throw e;
                  }
                }
              }
              setScheduleAllStatus((prev) => ({
                ...prev,
                [slotKey]: { status: "error", error: "Connection interrupted" },
              }));
              return "error";
            }
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.success === false) {
              setScheduleAllStatus((prev) => ({
                ...prev,
                [slotKey]: {
                  status: "error",
                  error: data?.error ?? data?.output ?? data?.details ?? `HTTP ${res.status}`,
                },
              }));
              return "error";
            }
            setScheduleAllStatus((prev) => ({
              ...prev,
              [slotKey]: {
                status: "success",
                liveUrl: data.liveUrl,
                scheduledFor: getScheduledFor(),
              },
            }));
            return "success";
          }

          const res = await fetch("/api/doordash", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ searchIntent: recipeName, stream: true }),
          });

          const contentType = res.headers.get("content-type") ?? "";
          if (contentType.includes("text/event-stream")) {
            const reader = res.body?.getReader();
            const decoder = new TextDecoder();
            if (!reader) throw new Error("No response body");
            let buffer = "";
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n\n");
              buffer = lines.pop() ?? "";
              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.type === "step") {
                    setScheduleAllStatus((prev) => ({
                      ...prev,
                      [slotKey]: {
                        ...prev[slotKey],
                        status: "ordering",
                        progressMessage: toFriendlyProgress(data.message ?? ""),
                      },
                    }));
                  } else if (data.type === "done") {
                    setScheduleAllStatus((prev) => ({
                      ...prev,
                      [slotKey]: {
                        status: "success",
                        liveUrl: data.liveUrl ?? undefined,
                        scheduledFor: getScheduledFor(),
                      },
                    }));
                    return "success";
                  } else if (data.type === "error") {
                    throw new Error(data.error ?? "Order failed");
                  }
                } catch (e) {
                  if (e instanceof SyntaxError) continue;
                  throw e;
                }
              }
            }
            throw new Error("Connection interrupted");
          }

          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            setScheduleAllStatus((prev) => ({
              ...prev,
              [slotKey]: { status: "error", error: data?.error ?? data?.details ?? `HTTP ${res.status}` },
            }));
            return "error";
          }
          setScheduleAllStatus((prev) => ({
            ...prev,
            [slotKey]: {
              status: "success",
              liveUrl: data.liveUrl,
              scheduledFor: getScheduledFor(),
            },
          }));
          return "success";
        } catch (err) {
          setScheduleAllStatus((prev) => ({
            ...prev,
            [slotKey]: {
              status: "error",
              error: err instanceof Error ? err.message : "Request failed",
            },
          }));
          return "error";
        }
      })
    );

    const success = results.filter((r) => r === "success").length;
    const failed = results.filter((r) => r === "error").length;
    setScheduleToast({ success, failed });
    setTimeout(() => setScheduleToast(null), 5000);
  };

  // Removed: handleAddTestDineOutSlots was a hardcoded dev tool that always
  // wrote Friday/Saturday dinners. Dine-out slots are now managed dynamically
  // through the chat agent via update_preferences + populate_meal_plan.

  // Maps ingredient labels → Spoonacular CDN slugs. Source: https://img.spoonacular.com/ingredients_100x100/{slug}.jpg
  // See docs/INGREDIENT_ICONS.md for how to add more.
  const INGREDIENT_IMAGE_MAP: Record<string, string> = {
    potatoes: "potato",
    tomatoes: "tomato",
    tomato: "tomato",
    peppers: "bell-pepper",
    pepper: "black-pepper",
    "bell pepper": "bell-pepper",
    "bell peppers": "bell-pepper",
    "green pepper": "bell-pepper",
    "red pepper": "bell-pepper",
    "yellow pepper": "bell-pepper",
    broccoli: "broccoli",
    pepperoni: "pepperoni",
    salt: "salt",
    "flat leaf parsley": "parsley",
    "flat-leaf parsley": "parsley",
    "italian parsley": "parsley",
    "curly parsley": "parsley",
    "kosher salt": "salt",
    "sea salt": "salt",
    "table salt": "salt",
    "coarse salt": "salt",
    parsley: "parsley",
    basil: "basil",
    cilantro: "cilantro",
    garlic: "garlic",
    ginger: "ginger",
    onion: "onion",
    "green onions": "scallions",
    scallions: "scallions",
    lemon: "lemon",
    lemons: "lemon",
    lime: "lime",
    limes: "lime",
    "olive oil": "olive-oil",
    "soy sauce": "soy-sauce",
    "sesame oil": "sesame-oil",
    "rice vinegar": "rice-vinegar",
    chicken: "chicken",
    beef: "beef",
    "chicken broth": "chicken-broth",
    "vegetable broth": "vegetable-broth",
    "beef broth": "beef-broth",
    carrot: "carrot",
    carrots: "carrot",
    celery: "celery",
    onions: "onion",
    eggs: "egg",
    egg: "egg",
    flour: "flour",
    butter: "butter",
    milk: "milk",
    cheese: "cheddar-cheese",
    "cream cheese": "cream-cheese",
    beans: "black-beans",
    honey: "honey",
    sugar: "sugar",
    vinegar: "vinegar",
    "apple cider vinegar": "apple-cider-vinegar",
    "balsamic vinegar": "balsamic-vinegar",
    coconut: "coconut",
    "coconut milk": "coconut-milk",
    "fish sauce": "fish-sauce",
    "oyster sauce": "oyster-sauce",
    spinach: "spinach",
    lettuce: "lettuce",
    "romaine lettuce": "lettuce",
    mushrooms: "mushroom",
    mushroom: "mushroom",
    zucchini: "zucchini",
    squash: "squash",
    avocado: "avocado",
    avocados: "avocado",
    banana: "banana",
    bananas: "banana",
    apple: "apple",
    apples: "apple",
    orange: "orange",
    oranges: "orange",
    strawberry: "strawberry",
    strawberries: "strawberry",
    blueberry: "blueberry",
    blueberries: "blueberry",
    raspberry: "raspberry",
    raspberries: "raspberry",
    blackberry: "blackberry",
    blackberries: "blackberry",
    salmon: "salmon",
    shrimp: "shrimp",
    pork: "pork",
    tuna: "tuna",
    cod: "cod",
    rice: "rice",
    pasta: "pasta",
    "spaghetti": "pasta",
    bread: "bread",
    oats: "oats",
    "rolled oats": "oats",
    almond: "almonds",
    almonds: "almonds",
    walnut: "walnuts",
    walnuts: "walnuts",
    "peanut butter": "peanut-butter",
    yogurt: "yogurt",
    "greek yogurt": "yogurt",
    "sour cream": "sour-cream",
    "heavy cream": "cream",
    cream: "cream",
    "maple syrup": "maple-syrup",
    "vanilla extract": "vanilla-extract",
    "baking powder": "baking-powder",
    "baking soda": "baking-soda",
    paprika: "paprika",
    "chili powder": "chili-powder",
    cumin: "cumin",
    oregano: "oregano",
    thyme: "thyme",
    rosemary: "rosemary",
    "bay leaves": "bay-leaves",
    "bay leaf": "bay-leaves",
    turmeric: "turmeric",
    cinnamon: "cinnamon",
    nutmeg: "nutmeg",
    "red onion": "onion",
    "white onion": "onion",
    "yellow onion": "onion",
    kale: "kale",
    "sweet potato": "sweet-potato",
    "sweet potatoes": "sweet-potato",
    corn: "corn",
    peas: "peas",
    "green beans": "green-beans",
    asparagus: "asparagus",
    cauliflower: "cauliflower",
    cabbage: "cabbage",
    "brussels sprouts": "brussels-sprouts",
    tofu: "tofu",
    lentils: "lentils",
    "black beans": "black-beans",
    "kidney beans": "kidney-beans",
    chickpeas: "chickpeas",
    quinoa: "quinoa",
    jalapeno: "pepper", jalapeño: "pepper", jalapeños: "pepper", serrano: "pepper", serranos: "pepper",
    habanero: "pepper", habaneros: "pepper", poblano: "bell-pepper", poblanos: "bell-pepper",
    anaheim: "bell-pepper", "chili pepper": "pepper", "chili peppers": "pepper",
  };

  // Unknown ingredient → closest relative we have (for image slug + emoji fallback)
  const INGREDIENT_RELATIVE_MAP: Record<string, string> = {
    jalapeno: "pepper", jalapeño: "pepper", jalapeños: "pepper", serrano: "pepper", serranos: "pepper",
    habanero: "pepper", habaneros: "pepper", poblano: "bell pepper", poblanos: "bell pepper",
    anaheim: "bell pepper", cayenne: "pepper", chipotle: "pepper", paprika: "pepper",
    "chili pepper": "pepper", "chili peppers": "pepper", "red chili": "pepper", "green chili": "pepper",
    oregano: "basil", thyme: "basil", rosemary: "basil", "bay leaf": "basil", "bay leaves": "basil",
    mint: "basil", dill: "parsley", tarragon: "parsley", chive: "scallions", chives: "scallions",
    leek: "onion", leeks: "onion", shallot: "onion", shallots: "onion",
    "sweet potato": "potato", "sweet potatoes": "potato", yam: "potato", yams: "potato",
    turnip: "potato", turnips: "potato", radish: "carrot", radishes: "carrot", beet: "carrot", beets: "carrot",
    cucumber: "zucchini", cucumbers: "zucchini", eggplant: "tomato", "bell pepper": "bell pepper",
    "kidney bean": "black beans", "pinto bean": "black beans", "navy bean": "black beans",
    "cannellini bean": "chickpeas", "white bean": "chickpeas", "black bean": "black beans",
    "soy sauce": "soy sauce", "worcestershire": "vinegar", mustard: "vinegar",
    "maple syrup": "honey", "agave": "honey", molasses: "honey",
  };

  const getIngredientImageUrl = (label: string) => {
    const key = label.toLowerCase().trim().replace(/\s+/g, " ");
    const words = key.split(/\s+/);
    const lastWord = words[words.length - 1];
    const relative = INGREDIENT_RELATIVE_MAP[key] ?? (lastWord ? INGREDIENT_RELATIVE_MAP[lastWord] : undefined);
    const rawSlug =
      INGREDIENT_IMAGE_MAP[key] ??
      (lastWord ? INGREDIENT_IMAGE_MAP[lastWord] : undefined) ??
      (relative ? INGREDIENT_IMAGE_MAP[relative] : undefined) ??
      key;
    const slug = String(rawSlug)
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    return `https://img.spoonacular.com/ingredients_100x100/${slug}.jpg`;
  };

  const INGREDIENT_EMOJI_MAP: Record<string, string> = {
    "bell pepper": "🫑", "bell peppers": "🫑", "green pepper": "🫑", "red pepper": "🫑", "yellow pepper": "🫑",
    pepper: "🌶️", peppers: "🫑", tomato: "🍅", tomatoes: "🍅", onion: "🧅", onions: "🧅",
    garlic: "🧄", ginger: "🫚", carrot: "🥕", carrots: "🥕", celery: "🥬", broccoli: "🥦", potato: "🥔", potatoes: "🥔",
    parsley: "🌿", basil: "🌿", cilantro: "🌿", lettuce: "🥬", spinach: "🥬", kale: "🥬", mushroom: "🍄", mushrooms: "🍄",
    zucchini: "🥒", squash: "🎃", avocado: "🥑", lemon: "🍋", lemons: "🍋", lime: "🍋", limes: "🍋",
    apple: "🍎", apples: "🍎", banana: "🍌", bananas: "🍌", orange: "🍊", oranges: "🍊", strawberry: "🍓", strawberries: "🍓",
    blueberry: "🫐", blueberries: "🫐", raspberry: "🍇", raspberries: "🍇", blackberry: "🫐", blackberries: "🫐",
    chicken: "🍗", beef: "🥩", pork: "🥩", salmon: "🐟", shrimp: "🍤", egg: "🥚", eggs: "🥚",
    cheese: "🧀", milk: "🥛", butter: "🧈", bread: "🍞", rice: "🍚", pasta: "🍝", flour: "🌾",
    honey: "🍯", sugar: "🍬", salt: "🧂", "olive oil": "🫒", olive: "🫒", coconut: "🥥", tofu: "🧈", lentils: "🫘", beans: "🫘",
    peas: "🫛", corn: "🌽", asparagus: "🌿", cauliflower: "🥦", cabbage: "🥬",
    quinoa: "🌾", oats: "🌾", almond: "🥜", almonds: "🥜", walnut: "🥜", walnuts: "🥜",
    scallions: "🧅", "green onions": "🧅", vinegar: "🫙", "soy sauce": "🫙", "sesame oil": "🫒",
    "chicken broth": "🍗", "vegetable broth": "🫙", "beef broth": "🥩",
    water: "💧", ice: "🧊", oil: "🫒", cream: "🥛", yogurt: "🥛", "sour cream": "🥛",
    jalapeno: "🌶️", jalapeño: "🌶️", jalapeños: "🌶️", serrano: "🌶️", habanero: "🌶️",
    poblano: "🫑", anaheim: "🫑", cayenne: "🌶️", chipotle: "🌶️",
  };
  const getIngredientFallback = (label: string) => {
    const key = label.toLowerCase().trim().replace(/\s+/g, " ");
    const words = key.split(/\s+/);
    const lastWord = words[words.length - 1];
    const emoji =
      INGREDIENT_EMOJI_MAP[key] ??
      (lastWord ? INGREDIENT_EMOJI_MAP[lastWord] : undefined) ??
      (lastWord ? INGREDIENT_EMOJI_MAP[INGREDIENT_RELATIVE_MAP[lastWord] ?? ""] : undefined) ??
      INGREDIENT_EMOJI_MAP[INGREDIENT_RELATIVE_MAP[key] ?? ""];
    return emoji ?? label.charAt(0).toUpperCase();
  };

  // Client-side synonym map for grocery list deduplication (keys must be lowercase for lookup)
  const GROCERY_SYNONYMS: Record<string, string> = {
    // Cheese — any type → cheese
    cheddar: "cheese",
    "cheddar cheese": "cheese",
    "mexican cheese": "cheese",
    "queso": "cheese",
    mozzarella: "cheese",
    "mozzarella cheese": "cheese",
    parmesan: "cheese",
    "parmesan cheese": "cheese",
    "cream cheese": "cheese",
    feta: "cheese",
    "feta cheese": "cheese",
    gouda: "cheese",
    "gouda cheese": "cheese",
    "swiss cheese": "cheese",
    "monterey jack": "cheese",
    "colby jack": "cheese",
    "pepper jack": "cheese",
    ricotta: "cheese",
    "ricotta cheese": "cheese",
    "cottage cheese": "cheese",
    "goat cheese": "cheese",
    "blue cheese": "cheese",
    provolone: "cheese",
    "shredded cheddar": "cheese",
    "shredded cheese": "cheese",
    "cheddar shredded": "cheese",
    "mozzarella shredded": "cheese",
    "colby": "cheese",
    "monterey": "cheese",
    "brie": "cheese",
    "gruyere": "cheese",
    "asiago": "cheese",
    "havarti": "cheese",
    "mascarpone": "cheese",
    "pepper flakes": "pepper",
    "red pepper flakes": "pepper",
    "crushed red pepper": "pepper",
    "ground pepper": "pepper",
    "black pepper": "pepper",
    "white pepper": "pepper",
    "kosher salt": "salt",
    "sea salt": "salt",
    "table salt": "salt",
    "coarse salt": "salt",
    "flat leaf parsley": "parsley",
    "flat-leaf parsley": "parsley",
    "leaf parsley": "parsley",
    "italian parsley": "parsley",
    "curly parsley": "parsley",
    "light soy sauce": "soy sauce",
    "dark soy sauce": "soy sauce",
    "toasted sesame oil": "sesame oil",
    "extra virgin olive oil": "olive oil",
    "extra-virgin olive oil": "olive oil",
    "rice wine vinegar": "rice vinegar",
    "scallions": "green onions",
    "spring onions": "green onions",
    "fresh garlic": "garlic",
    "fresh ginger": "ginger",
    "ginger root": "ginger",
    "chicken stock": "chicken broth",
    "vegetable stock": "vegetable broth",
    "beef stock": "beef broth",
    "cherry tomato": "tomato",
    "cherry tomatoes": "tomato",
    tomatoes: "tomato",
    tomato: "tomato",
    "roma tomatoes": "tomato",
    "roma tomato": "tomato",
    "grape tomatoes": "tomato",
    "grape tomato": "tomato",
    "plum tomatoes": "tomato",
    "plum tomato": "tomato",
    "heirloom tomatoes": "tomato",
    "heirloom tomato": "tomato",
    "campari tomatoes": "tomato",
    "beefsteak tomatoes": "tomato",
    // Beans — any type → beans
    "black beans": "beans",
    "black bean": "beans",
    "kidney beans": "beans",
    "kidney bean": "beans",
    "pinto beans": "beans",
    "pinto bean": "beans",
    "navy beans": "beans",
    "navy bean": "beans",
    "cannellini beans": "beans",
    "cannellini bean": "beans",
    "white beans": "beans",
    "white bean": "beans",
    "garbanzo beans": "beans",
    "garbanzo bean": "beans",
    chickpeas: "beans",
    chickpea: "beans",
    "green beans": "beans",
    "green bean": "beans",
    "refried beans": "beans",
    "great northern beans": "beans",
    "lima beans": "beans",
    "fava beans": "beans",
  };

  const toSingular = (word: string): string => {
    const w = word.toLowerCase();
    if (["beans", "cheese", "cream", "tomato"].includes(w)) return w; // Keep category names as-is
    if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
    if (w.endsWith("es") && !w.endsWith("ss") && w.length > 3) return w.slice(0, -2);
    if (w.endsWith("s") && !w.endsWith("ss") && w.length > 2) return w.slice(0, -1);
    return w;
  };

  // Adjectives/modifiers to strip from any ingredient — "fresh parsley" → "parsley", "dried oregano" → "oregano"
  const INGREDIENT_ADJECTIVES = new Set([
    "fresh", "dried", "organic", "raw", "cooked", "frozen", "canned", "bottled", "jarred",
    "minced", "chopped", "sliced", "diced", "grated", "crushed", "ground", "whole",
    "large", "small", "medium", "extra", "optional", "roughly", "finely", "coarsely",
    "low", "reduced", "unsalted", "salted", "plain", "unflavored", "natural", "pure",
    "smoked", "roasted", "toasted", "flat", "curly",
    "baby", "young", "mature", "aged", "wild", "farmed", "imported", "domestic", "local", "premium",
    "virgin", "light", "dark", "red", "yellow", "white", "green", "black", "brown", "golden",
    "italian", "spanish", "greek", "french", "dutch", "english", "asian",
    "all-purpose", "self-rising",
    "hot", "mild", "sweet", "sour", "bitter", "spicy",
    "thick", "thin", "soft", "hard", "sharp", "mild",
    "pressed", "squeezed", "peeled", "unpeeled", "seeded", "seedless",
    "skinless", "boneless", "bone-in", "trimmed", "untreated",
  ]);

  const stripAdjectives = (text: string): string => {
    const words = text.toLowerCase().trim().replace(/\s+/g, " ").split(/\s+/);
    const filtered = words.filter((w) => !INGREDIENT_ADJECTIVES.has(w)) as string[];
    return filtered.join(" ").trim() || text;
  };

  const CHEESE_WORDS = new Set([
    "cheese", "cheddar", "mozzarella", "parmesan", "feta", "gouda", "ricotta", "brie", "gruyere",
    "asiago", "havarti", "mascarpone", "provolone", "colby", "monterey", "queso", "swiss",
  ]);
  const BEAN_WORDS = new Set([
    "beans", "bean", "kidney", "pinto", "navy", "cannellini", "garbanzo", "chickpea",
    "chickpeas", "lima", "fava", "refried",
  ]);

  const getGroceryCanonicalKey = (name: string) => {
    const normalized = name.toLowerCase().trim().replace(/\s+/g, " ");
    const stripped = stripAdjectives(normalized);
    let withSynonym = GROCERY_SYNONYMS[stripped] ?? GROCERY_SYNONYMS[normalized];
    if (!withSynonym) {
      const words = stripped.split(/\s+/);
      const hasCheese = words.some((w) => CHEESE_WORDS.has(w) || w.includes("cheese"));
      const hasBean = words.some((w) => BEAN_WORDS.has(w) || (w.includes("bean") && !w.includes("coffee") && w !== "vanilla"));
      const hasTomato = words.some((w) => w === "tomato" || w === "tomatoes" || w.includes("tomato"));
      const hasOnion = words.some((w) => w === "onion" || w === "onions" || w.includes("onion"));
      const hasGarlic = words.some((w) => w === "garlic" || w.includes("garlic"));
      if (hasCheese) withSynonym = "cheese";
      else if (hasBean) withSynonym = "beans";
      else if (hasTomato) withSynonym = "tomato";
      else if (hasOnion) withSynonym = "onion";
      else if (hasGarlic) withSynonym = "garlic";
      else withSynonym = stripped;
    }
    const words = withSynonym.split(/\s+/);
    const lastWord = words[words.length - 1];
    if (lastWord) {
      words[words.length - 1] = toSingular(lastWord);
    }
    return words.join(" ");
  };

  const isInFridge = (groceryName: string) => {
    const groceryKey = getGroceryCanonicalKey(groceryName);
    return fridgeItems.some(
      (f) => getGroceryCanonicalKey(f.label) === groceryKey
    );
  };

  // Dedupe fridge display: group by canonical key, show one card per type (e.g. cheddar + Mexican cheese → "cheese")
  const getDedupedFridgeDisplay = () => {
    const byKey = new Map<string, { displayLabel: string; ids: string[] }>();
    for (const item of fridgeItems) {
      const key = getGroceryCanonicalKey(item.label);
      const existing = byKey.get(key);
      if (existing) {
        existing.ids.push(item.id);
      } else {
        byKey.set(key, { displayLabel: key, ids: [item.id] });
      }
    }
    return Array.from(byKey.entries()).map(([groupKey, { displayLabel, ids }]) => ({
      groupKey,
      displayLabel,
      ids,
    }));
  };

  const getDedupedGroceryItems = () => {
    if (!groceryList?.items?.length) return [];
    const seen = new Set<string>();
    const filtered = groceryList.items.filter((item: { name: string }) => {
      const key = getGroceryCanonicalKey(item.name);
      if (seen.has(key)) return false;
      if (isInFridge(item.name)) return false;
      seen.add(key);
      return true;
    });
    const hasSalt = seen.has("salt");
    const hasPepper = seen.has("pepper");
    return filtered.filter((item: { name: string }) => {
      const norm = item.name.toLowerCase().trim().replace(/\s+/g, " ");
      if (norm === "salt and pepper" && hasSalt && hasPepper) return false;
      return true;
    });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-white border-b border-black shrink-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center">
                <img src="/aurelia-logo.png" alt="Aurelia" className="w-8 h-8 object-contain" />
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/" className="px-4 py-2 border border-black text-black text-sm font-medium hover:bg-black hover:text-white transition-colors">
                Home
              </Link>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
            {!activePlan ? (
              intakeGrace ? (
              <div className="text-center py-20">
                <div className="flex justify-center mb-6">
                  <div className="flex gap-1">
                    <span className="w-2.5 h-2.5 bg-black animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2.5 h-2.5 bg-black animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2.5 h-2.5 bg-black animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
                <h2 className="font-display text-2xl font-semibold text-black mb-4">
                  Setting up your meal plan...
                </h2>
                <p className="text-black/70 max-w-md mx-auto">
                  Aurelia is putting everything together. This will only take a moment.
                </p>
              </div>
              ) : (
              <div className="text-center py-20">
                <h2 className="font-display text-2xl font-semibold text-black mb-4">
                  No meal plan yet
                </h2>
                <p className="text-black/70 mb-8 max-w-md mx-auto">
                  Head back to the chat and tell Aurelia about your dietary preferences. She&apos;ll generate a personalized meal plan for you.
                </p>
                <Link
                  href="/"
                  className="inline-flex px-6 py-3 border border-black text-black font-medium hover:bg-black hover:text-white transition-colors"
                >
                  Start planning
                </Link>
              </div>
              )
            ) : (
              <>
                <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <h1 className="font-display text-3xl font-semibold text-black">
                    {(() => {
                      const hour = new Date().getHours();
                      const greeting =
                        hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
                      const name = currentUser?.name ?? currentUser?.email?.split("@")[0] ?? "there";
                      return `${greeting}, ${name}`;
                    })()}
                  </h1>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleScheduleAll}
                      disabled={takeoutSlotsForSchedule.length === 0 || (scheduleProgress?.ordering ?? 0) > 0}
                      className="px-4 py-2.5 text-sm font-medium border border-black text-black hover:bg-black hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {scheduleProgress && scheduleProgress.ordering > 0 ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="flex gap-0.5">
                            <span className="w-1.5 h-1.5 bg-black animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="w-1.5 h-1.5 bg-black animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="w-1.5 h-1.5 bg-black animate-bounce" style={{ animationDelay: "300ms" }} />
                          </span>
                          Ordering {scheduleProgress.done + scheduleProgress.ordering} of {scheduleProgress.total}…
                        </span>
                      ) : (
                        "Schedule all deliveries"
                      )}
                    </button>
                  </div>
                </div>

                {/* Day cards — sharp grid, no gaps between cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 border border-black divide-x divide-y divide-black">
                  {rollingDays.map(({ date, label, dayName, planDayName }) => {
                    const dateStr = date.toISOString().slice(0, 10);
                    const dayCalories = getDayCalories(planDayName, dayName, dateStr);
                    const dayKey = `${dayName}-${date.toISOString().slice(0, 10)}`;
                    return (
                      <div
                        key={dayKey}
                        className="p-4 min-h-[280px] flex flex-col bg-white"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-semibold text-black">
                            {label}
                          </h3>
                          {dayCalories > 0 && (
                            <span className="text-sm font-medium text-black">
                              {Math.round(dayCalories)} cal
                            </span>
                          )}
                        </div>
                        <div className="space-y-0 flex-1 min-h-0">
                          {mealTypes.map((mealType) => {
                            const meal = planDayName ? getMeal(planDayName, mealType) : null;
                            const isExpanded = expandedRecipe?.day === dayName && expandedRecipe?.mealType === mealType;
                            return (
                              <div key={`${dayName}-${mealType}`} className="border-b border-black last:border-0 pt-2.5 pb-2.5 last:pb-0 min-h-[56px] flex flex-col">
                                <p className="text-xs font-medium text-black/70 capitalize mb-1 shrink-0">
                                  {mealType}
                                </p>
                                {meal ? (
                                  meal.isTakeout && meal.takeoutService === "opentable" ? (
                                    <DineOutReservationButton
                                      variant="card"
                                      restaurantName={meal.recipeName}
                                      slotKey={`${dayName}-${mealType}`}
                                      dateStr={dateStr}
                                      defaultTime={meal.takeoutDetails ?? "19:00"}
                                      scheduleStatus={scheduleAllStatus[`${dateStr}-${planDayName}-${mealType}`]}
                                      onClearScheduleError={() =>
                                        setScheduleAllStatus((prev) => {
                                          const next = { ...prev };
                                          delete next[`${dateStr}-${planDayName}-${mealType}`];
                                          return next;
                                        })
                                      }
                                      onMealChange={
                                        planDayName && activePlan?._id
                                          ? async (restaurantName) => {
                                              await upsertMeal({
                                                mealPlanId: activePlan._id,
                                                day: planDayName,
                                                mealType,
                                                recipeId: "dineout-opentable",
                                                recipeName: restaurantName,
                                                isTakeout: true,
                                                takeoutService: "opentable",
                                                takeoutDetails: getDefaultTimeForRestaurant(restaurantName),
                                                isManualOverride: true,
                                              });
                                            }
                                          : undefined
                                      }
                                    />
                                  ) : meal.isTakeout ? (
                                    <TakeoutOrderButton
                                      variant="card"
                                      searchIntent={meal.recipeName}
                                      slotKey={`${dayName}-${mealType}`}
                                      scheduleStatus={scheduleAllStatus[`${dateStr}-${planDayName}-${mealType}`]}
                                      onClearScheduleError={() =>
                                        setScheduleAllStatus((prev) => {
                                          const next = { ...prev };
                                          delete next[`${dateStr}-${planDayName}-${mealType}`];
                                          return next;
                                        })
                                      }
                                      onMealChange={
                                        planDayName && activePlan?._id
                                          ? async (mealName) => {
                                              const slotKey = `${dateStr}-${planDayName}-${mealType}`;
                                              setPendingTakeoutOverrides((prev) => ({ ...prev, [slotKey]: mealName }));
                                              const cal = getTakeoutCalories(mealName);
                                              await upsertMeal({
                                                mealPlanId: activePlan._id,
                                                day: planDayName,
                                                mealType,
                                                recipeId: "takeout-doordash",
                                                recipeName: mealName,
                                                isTakeout: true,
                                                isManualOverride: true,
                                                calories: cal ?? undefined,
                                              });
                                            }
                                          : undefined
                                      }
                                    />
                                  ) : (
                                  <div>
                                    {(meal.recipeImageUrl || meal.sourceUrl || meal.recipeId) ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const nextExpanded = isExpanded ? null : { day: dayName, mealType };
                                            setExpandedRecipe(nextExpanded);
                                          }}
                                          className="text-left w-full text-sm font-medium text-black hover:underline transition-colors"
                                        >
                                          {meal.recipeName}
                                        </button>
                                        {isExpanded && (
                                          <div className="mt-2 space-y-3">
                                            {/* Recipe image + link */}
                                            {(meal.recipeImageUrl || meal.sourceUrl || meal.recipeId) && (
                                              <div className="space-y-1">
                                                {meal.recipeImageUrl && (
                                                  <img
                                                    src={meal.recipeImageUrl}
                                                    alt={meal.recipeName}
                                                    className="w-full h-32 object-cover rounded-lg"
                                                  />
                                                )}
                                                {(meal.sourceUrl || meal.recipeId) && (
                                                  <a
                                                    href={
                                                      meal.sourceUrl ||
                                                      `https://spoonacular.com/recipes/${(meal.recipeName || "recipe").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}-${meal.recipeId}`
                                                    }
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="block text-xs font-medium text-black hover:underline truncate"
                                                  >
                                                    {meal.sourceUrl?.includes("tiktok.com") ? "View TikTok →" : "View recipe →"}
                                                  </a>
                                                )}
                                              </div>
                                            )}
                                            {/* Ingredients */}
                                            <div>
                                              <p className="text-[10px] font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-1">Ingredients</p>
                                              {meal.ingredients && meal.ingredients.length > 0 ? (
                                                <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
                                                  {meal.ingredients.map((ing: { name: string }, i: number) => ing.name).join(", ")}
                                                </p>
                                              ) : (
                                                <p className="text-xs text-black/70 italic">
                                                  Ingredients not available.
                                                </p>
                                              )}
                                            </div>
                                            {/* Nutrition summary */}
                                            {(meal.calories != null || meal.protein != null || meal.carbs != null || meal.fat != null) && (
                                              <div className="pt-2 border-t border-black">
                                                <p className="text-[10px] font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-1">Nutrition</p>
                                                <p className="text-xs text-stone-600 dark:text-stone-300">
                                                  {Math.round(meal.calories || 0)} cal
                                                  {(meal.protein != null || meal.carbs != null || meal.fat != null) && (
                                                    <span className="text-stone-400 dark:text-stone-500 mx-1.5">·</span>
                                                  )}
                                                  {meal.protein != null && <span className="text-rust-500">P {Math.round(meal.protein)}g</span>}
                                                  {meal.protein != null && (meal.carbs != null || meal.fat != null) && <span className="text-stone-400 dark:text-stone-500 mx-1">·</span>}
                                                  {meal.carbs != null && <span className="text-rust-600 dark:text-rust-400">C {Math.round(meal.carbs)}g</span>}
                                                  {meal.carbs != null && meal.fat != null && <span className="text-stone-400 dark:text-stone-500 mx-1">·</span>}
                                                  {meal.fat != null && <span className="text-stone-600 dark:text-stone-400">F {Math.round(meal.fat)}g</span>}
                                                </p>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <p className="text-sm font-medium text-black">
                                        {meal.recipeName}
                                      </p>
                                    )}
                                  </div>
                                  )
                                ) : (
                                  <p className="text-sm text-black/40 italic">Not planned</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {/* Nutrition widget - today's calories & macros (ring) */}
                  {currentMeals.length > 0 && (() => {
                    const todaySlot = rollingDays[0];
                    const todayPlanDay = todaySlot?.planDayName ?? null;
                    const todaySlotDay = todaySlot?.dayName ?? todayDayName;
                    const todayDateStr = todaySlot?.date ? todaySlot.date.toISOString().slice(0, 10) : undefined;
                    const todayCal = getDayCalories(todayPlanDay, todaySlotDay, todayDateStr);
                    const todayMeals = todayPlanDay
                      ? mealTypes
                          .map((mt) => getMeal(todayPlanDay, mt))
                          .filter((m): m is NonNullable<typeof m> => m != null)
                      : [];
                    const todayProtein = todayMeals.reduce((s, m) => s + (m.protein ?? 0), 0);
                    const todayCarbs = todayMeals.reduce((s, m) => s + (m.carbs ?? 0), 0);
                    const todayFat = todayMeals.reduce((s, m) => s + (m.fat ?? 0), 0);
                    const macroCal = todayProtein * 4 + todayCarbs * 4 + todayFat * 9;
                    const pctP = macroCal > 0 ? (todayProtein * 4) / macroCal : 0.33;
                    const pctC = macroCal > 0 ? (todayCarbs * 4) / macroCal : 0.33;
                    const pctF = macroCal > 0 ? (todayFat * 9) / macroCal : 0.34;
                    const p1 = pctP * 100;
                    const p2 = (pctP + pctC) * 100;
                    return (
                      <div className="bg-white p-4 flex flex-col items-center justify-center gap-3 min-h-[280px]">
                        <div
                          className="relative w-32 h-32 shrink-0"
                          style={{
                            background: `conic-gradient(from -90deg, #c87050 0% ${p1}%, #333 ${p1}% ${p2}%, #666 ${p2}% 100%)`,
                          }}
                        >
                          <div className="absolute inset-[24%] rounded-full bg-white border border-black" />
                          <div className="absolute inset-[24%] flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-lg font-bold text-black leading-none">{Math.round(todayCal)}</span>
                            <span className="text-xs text-black/70 mt-0.5">cal today</span>
                          </div>
                        </div>
                        <div className="text-sm text-black text-center leading-tight">
                          <span className="text-rust-500">P {Math.round(todayProtein)}g</span>
                          <span className="mx-1.5 text-black/50">·</span>
                          <span>C {Math.round(todayCarbs)}g</span>
                          <span className="mx-1.5 text-black/50">·</span>
                          <span>F {Math.round(todayFat)}g</span>
                        </div>
                        <p className="text-xs text-black/70 text-center">
                          {todayMeals.length} meal{todayMeals.length !== 1 ? "s" : ""} today
                        </p>
                      </div>
                    );
                  })()}
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {/* Fridge sidebar - collapsible */}
      <aside className={`hidden md:flex shrink-0 flex-col border-l border-black bg-white dark:bg-stone-900 transition-[width] duration-200 ease-out ${fridgeOpen ? "w-64 lg:w-72" : "w-12"}`}>
        {fridgeOpen ? (
          <div className="flex flex-1 flex-col overflow-hidden min-w-0 min-h-0">
            <div className="shrink-0 px-4 py-2 flex items-center justify-between border-b border-black">
              <h2 className="font-display text-base font-semibold text-black">My Fridge</h2>
              <button
                type="button"
                onClick={() => setFridgeOpen(false)}
                className="w-8 h-8 border border-black text-black hover:bg-black hover:text-white flex items-center justify-center transition-colors"
                aria-label="Collapse sidebar"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
              {/* Fridge section */}
              <div className="shrink-0 px-4 py-3 border-b border-black">
                <input
                  type="text"
                  value={fridgeInput}
                  onChange={(e) => setFridgeInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addFridgeItems(getGroceryCanonicalKey)}
                  placeholder="Add ingredients (press Enter)"
                  className="w-full px-3 py-2 text-sm bg-transparent border-b border-black text-black placeholder:text-black/50 focus:outline-none mb-2"
                />
                <div className="relative min-h-[100px] py-2 bg-white">
                  <div className="flex flex-wrap gap-1.5 content-start">
                    {getDedupedFridgeDisplay().map(({ groupKey, displayLabel, ids }) => (
                      <div
                        key={groupKey}
                        className="group relative flex flex-col items-center gap-0.5 px-2 py-1.5 bg-white hover:ring-1 hover:ring-black/30 transition-colors"
                      >
                        <div className="relative w-10 h-10 shrink-0">
                          <img
                            src={getIngredientImageUrl(displayLabel)}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                              e.currentTarget.nextElementSibling?.classList.remove("hidden");
                            }}
                          />
                          <span
                            className="hidden absolute inset-0 w-10 h-10 flex items-center justify-center text-[22px] leading-none font-semibold text-black"
                            aria-hidden
                          >
                            {getIngredientFallback(displayLabel)}
                          </span>
                        </div>
                        <span className="text-[10px] font-medium text-black max-w-[70px] truncate text-center">
                          {displayLabel}
                        </span>
                        <button
                          type="button"
                          onClick={() => ids.forEach((id) => removeFridgeItem(id))}
                          className="absolute -top-0.5 -right-0.5 opacity-0 group-hover:opacity-100 w-4 h-4 bg-black hover:bg-white hover:text-black text-white text-[10px] font-bold flex items-center justify-center transition-opacity"
                          aria-label={`Remove ${displayLabel}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {fridgeItems.length === 0 && (
                      <p className="absolute inset-0 flex items-center justify-center text-sm text-black/50 text-center px-4">
                        Add ingredients above
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Grocery list section */}
              <div className="flex-1 min-h-0 px-4 py-3 flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-display text-base font-semibold text-black">Grocery list</h3>
                  {activePlan?._id && groceryList?.items && groceryList.items.length > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!activePlan?._id) return;
                        setGroceryGenerating(true);
                        try {
                          await generateGroceryList({ mealPlanId: activePlan._id });
                        } finally {
                          setGroceryGenerating(false);
                        }
                      }}
                      disabled={groceryGenerating}
                      className="text-[10px] font-semibold text-black hover:underline disabled:opacity-60"
                    >
                      {groceryGenerating ? "Updating…" : "Regenerate"}
                    </button>
                  )}
                </div>
                {activePlan?._id && (
                  (groceryList?.items && groceryList.items.length > 0) ? (
                    <div className="relative flex-1 min-h-[120px] py-2 overflow-y-auto bg-white">
                      <div className="grid grid-cols-3 gap-1.5">
                        {getDedupedGroceryItems().map((item: { name: string; amount?: number; unit?: string }, i: number) => {
                              const canonicalKey = getGroceryCanonicalKey(item.name);
                              const displayName =
                                canonicalKey.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
                              const isSelected = selectedGroceryIndices.has(i);
                              return (
                          <div
                            key={`${item.name}-${i}`}
                            className={`flex flex-col items-center gap-0.5 p-1.5 min-w-0 cursor-pointer transition-colors bg-white ${
                              isSelected
                                ? "ring-1 ring-black"
                                : "hover:ring-1 hover:ring-black/30"
                            }`}
                            onClick={() => {
                              setSelectedGroceryIndices((prev) => {
                                const next = new Set(prev);
                                if (next.has(i)) next.delete(i);
                                else next.add(i);
                                return next;
                              });
                            }}
                          >
                            <div className="relative w-full aspect-square max-w-12 shrink-0">
                              {isSelected && (
                                <span className="absolute top-0 right-0 z-10 w-3.5 h-3.5 bg-black flex items-center justify-center text-white text-[9px]">✓</span>
                              )}
                              <img
                                src={getIngredientImageUrl(displayName)}
                                alt=""
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                  e.currentTarget.nextElementSibling?.classList.remove("hidden");
                                }}
                              />
                              <span
                                className="hidden absolute inset-0 w-full h-full flex items-center justify-center text-[22px] leading-none font-semibold text-black"
                                aria-hidden
                              >
                                {getIngredientFallback(displayName)}
                              </span>
                            </div>
                            <span className="text-[10px] font-medium text-black w-full truncate text-center">
                              {displayName}
                            </span>
                          </div>
                        );
                        })}
                      </div>
                      {getDedupedGroceryItems().length > 0 && (
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between text-[10px]">
                            <button
                              type="button"
                              onClick={() => setSelectedGroceryIndices(new Set(getDedupedGroceryItems().map((_, i) => i)))}
                              className="text-black hover:underline"
                            >
                              Select all
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedGroceryIndices(new Set())}
                              className="text-black/70 hover:underline"
                            >
                              Clear
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              const items = getDedupedGroceryItems();
                              const toOrder = items.filter((_, i) => selectedGroceryIndices.has(i));
                              if (toOrder.length === 0) return;
                              setInstacartOrdering(true);
                              setInstacartResult(null);
                              setInstacartError(null);
                              try {
                                const res = await fetch("/api/instacart", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    items: toOrder.map((i: { name: string; amount?: number; unit?: string }) => ({
                                      name: i.name,
                                      amount: i.amount,
                                      unit: i.unit,
                                    })),
                                  }),
                                });
                                const data = await res.json();
                                if (!res.ok) {
                                  setInstacartError(data.error || "Order failed");
                                  return;
                                }
                                setInstacartResult(data.output || "Items added to cart.");
                                if (data.liveUrl) {
                                  window.open(data.liveUrl, "_blank");
                                }
                              } catch (err) {
                                setInstacartError(err instanceof Error ? err.message : "Something went wrong");
                              } finally {
                                setInstacartOrdering(false);
                              }
                            }}
                            disabled={instacartOrdering || selectedGroceryIndices.size === 0}
                            className="w-full py-2 border border-black bg-black hover:bg-white hover:text-black disabled:opacity-60 text-white text-sm font-medium transition-all active:scale-[0.97]"
                          >
                            {instacartOrdering
                              ? "Adding to Instacart…"
                              : `Order ${selectedGroceryIndices.size} item${selectedGroceryIndices.size !== 1 ? "s" : ""} on Instacart`}
                          </button>
                          {instacartResult && (
                            <p className="text-xs text-black">{instacartResult}</p>
                          )}
                          {instacartError && (
                            <p className="text-xs text-black">{instacartError}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="relative flex-1 min-h-[120px] py-4 flex flex-col items-center justify-center">
                      <p className="text-sm text-black/70 text-center mb-3">
                        Add items from your recipes
                      </p>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!activePlan?._id) return;
                          setGroceryGenerating(true);
                          try {
                            await generateGroceryList({ mealPlanId: activePlan._id });
                          } finally {
                            setGroceryGenerating(false);
                          }
                        }}
                        disabled={groceryGenerating}
                        className="px-4 py-2 border border-black bg-black hover:bg-white hover:text-black disabled:opacity-60 text-white text-sm font-semibold transition-colors"
                      >
                        {groceryGenerating ? "Generating…" : "Add items to grocery list"}
                      </button>
                    </div>
                  )
                )}
                {!activePlan?._id && (
                  <div className="relative flex-1 min-h-[80px] py-4 flex items-center justify-center">
                    <p className="text-sm text-black/70 text-center">
                      Create a meal plan first
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setFridgeOpen(true)}
            className="flex h-full w-full items-center justify-center bg-white hover:bg-black/5 transition-colors"
            aria-label="Expand fridge"
            title="Show fridge"
          >
            <span className="text-[11px] font-semibold text-black [writing-mode:vertical-rl] rotate-180">
              Fridge
            </span>
          </button>
        )}
      </aside>

      {/* Chat panel — desktop collapsible sidebar (like fridge) */}
      <aside className={`hidden md:flex shrink-0 flex-col border-l border-black bg-white transition-[width] duration-200 ease-out ${chatOpen ? "w-96" : "w-12"}`}>
        {chatOpen ? (
          <div className="flex flex-1 flex-col overflow-hidden min-w-0 min-h-0">
            <div className="shrink-0 px-4 py-3 flex items-center justify-between border-b border-black">
              <img src="/aurelia-logo.png" alt="" className="w-6 h-6 object-contain" />
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                className="w-8 h-8 border border-black text-black hover:bg-black hover:text-white flex items-center justify-center transition-colors"
                aria-label="Collapse chat"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <Chat variant="panel" placeholder="Swap Thursday dinner to pasta..." />
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            className="flex h-full w-full items-center justify-center bg-white hover:bg-black/5 transition-colors"
            aria-label="Expand chat"
            title="Chat"
          >
            <span className="text-[11px] font-semibold text-black [writing-mode:vertical-rl] rotate-180">
              Chat
            </span>
          </button>
        )}
      </aside>

      {/* Chat panel — mobile full-width overlay */}
      {chatOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-white flex flex-col">
          <div className="shrink-0 px-4 py-3 flex items-center justify-between border-b border-black">
            <img src="/aurelia-logo.png" alt="" className="w-6 h-6 object-contain" />
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              className="w-8 h-8 border border-black text-black hover:bg-black hover:text-white flex items-center justify-center transition-colors"
            >
              &times;
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <Chat variant="panel" placeholder="Swap Thursday dinner to pasta..." />
          </div>
        </div>
      )}

      {/* Schedule completion toast */}
      {scheduleToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-medium shadow-lg border border-stone-700 dark:border-stone-300">
          {scheduleToast.failed === 0 ? (
            <>All {scheduleToast.success} added to cart</>
          ) : scheduleToast.success === 0 ? (
            <>All {scheduleToast.failed} failed — tap Retry on each card</>
          ) : (
            <>
              {scheduleToast.success} added to cart · {scheduleToast.failed} failed
            </>
          )}
        </div>
      )}

      {/* Floating toggle button — mobile only (desktop has collapsible sidebar) */}
      {!chatOpen && (
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          className="md:hidden fixed bottom-6 right-6 z-40 px-4 py-2.5 border border-black bg-black hover:bg-white hover:text-black text-white font-semibold text-sm transition-all active:scale-[0.97] flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Chat
        </button>
      )}
    </div>
  );
}
