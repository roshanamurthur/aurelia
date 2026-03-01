"use client";

import type { MealSlot } from "@/lib/types";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import MealCard from "./MealCard";

export interface MealDragData {
  date: string;
  slotIndex: number;
  mealType: string;
}

function idFrom(data: MealDragData): string {
  return `${data.date}-${data.slotIndex}`;
}

interface DraggableSlotProps {
  slot: MealSlot;
  date: string;
  userId: string;
  weekStart: string;
  onSlotUpdate?: () => void;
}

function DraggableSlot({ slot, date, userId, weekStart, onSlotUpdate }: DraggableSlotProps) {
  const data: MealDragData = { date, slotIndex: slot.slotIndex, mealType: slot.mealType };
  const id = idFrom(data);

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id,
    data,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id,
    data,
  });

  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      setDragRef(node);
      setDropRef(node);
    },
    [setDragRef, setDropRef]
  );

  if (slot.type === "empty" || !slot.recipe || slot.isTakeout) {
    return <MealCard slot={slot} date={date} userId={userId} weekStart={weekStart} onSwap={onSlotUpdate} />;
  }

  return (
    <div
      ref={setRef}
      {...listeners}
      {...attributes}
      className={`rounded-xl transition-all ${isDragging ? "opacity-40" : ""} ${isOver ? "ring-2 ring-rust-500/60 bg-rust-50/30 dark:bg-rust-900/20" : ""}`}
    >
      <MealCard slot={slot} date={date} userId={userId} weekStart={weekStart} onSwap={onSlotUpdate} />
    </div>
  );
}

interface DragOverlayContentProps {
  slot: MealSlot | null;
  date: string;
}

function DragOverlayContent({ slot, date }: DragOverlayContentProps) {
  if (!slot?.recipe) return null;
  return (
    <div className="rounded-xl bg-white dark:bg-stone-900 shadow-xl border border-stone-200 dark:border-stone-700 p-3 w-[240px] opacity-95 cursor-grabbing">
      <MealCard slot={slot} date={date} userId="" weekStart="" />
    </div>
  );
}

interface DraggableMealCardProps {
  slot: MealSlot;
  date: string;
  userId: string;
  weekStart: string;
  onSlotUpdate?: () => void;
}

export function DraggableMealCard(props: DraggableMealCardProps) {
  return <DraggableSlot {...props} />;
}

interface MealPlanDndContextProps {
  children: React.ReactNode;
  weekDays: Array<{ date: string; meals: MealSlot[] }>;
  userId: string;
  weekStart: string;
  onSlotUpdate?: () => void;
}

export function MealPlanDndContext({
  children,
  weekDays,
  userId,
  weekStart,
  onSlotUpdate,
}: MealPlanDndContextProps) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveId(null);
      const over = event.over;
      if (!over || String(over.id) === String(event.active.id)) return;

      const source = event.active.data?.current as MealDragData | undefined;
      if (!source) return;
      const [targetDate, targetSlotStr] = String(over.id).split("|");
      const targetSlotIndex = parseInt(targetSlotStr, 10);
      if (!targetDate || isNaN(targetSlotIndex) || (source.date === targetDate && source.slotIndex === targetSlotIndex)) return;

      const targetDay = weekDays.find((d) => d.date === targetDate);
      const targetSlot = targetDay?.meals?.[targetSlotIndex];
      if (!targetSlot?.recipe || targetSlot.mealType !== source.mealType) return;

      try {
        const res = await fetch("/api/meal-plan/swap-slots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            weekStart,
            sourceDate: source.date,
            sourceSlotIndex: source.slotIndex,
            targetDate,
            targetSlotIndex,
          }),
        });
        if (res.ok) {
          router.refresh();
          onSlotUpdate?.();
        }
      } catch (e) {
        console.error("Swap failed:", e);
      }
    },
    [userId, weekStart, weekDays, router, onSlotUpdate]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const activeData = activeId ? (() => {
    const [date, slotIdxStr] = activeId.split("|");
    const slotIdx = parseInt(slotIdxStr, 10);
    const day = weekDays.find((d) => d.date === date);
    const slot = day?.meals?.[slotIdx];
    return { data: { date, slotIndex: slotIdx, mealType: slot?.mealType ?? "" }, slot, date };
  })() : null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {children}
      <DragOverlay>
        {activeData ? (
          <DragOverlayContent
            slot={activeData.slot ?? null}
            date={activeData.date}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
