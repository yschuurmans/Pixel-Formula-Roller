import { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ProfileSkill } from '../types/profile';

function formatModifier(modifier: number): string {
  return modifier > 0 ? `+${modifier}` : String(modifier);
}

function SkillCard({
  skill,
  onRemove,
  onUpdateLabel,
  onUpdateModifier,
}: {
  skill: ProfileSkill;
  onRemove: (skillId: string) => void;
  onUpdateLabel: (skillId: string, label: string) => void;
  onUpdateModifier: (skillId: string, modifier: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: skill.id });
  const [editingField, setEditingField] = useState<'label' | 'modifier' | null>(null);
  const [modifierDraft, setModifierDraft] = useState(String(skill.modifier));
  const labelInputRef = useRef<HTMLInputElement | null>(null);
  const modifierInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingField === 'label') {
      labelInputRef.current?.focus();
      labelInputRef.current?.select();
    }
  }, [editingField]);

  useEffect(() => {
    if (editingField === 'modifier') {
      modifierInputRef.current?.focus();
      modifierInputRef.current?.select();
      setModifierDraft(String(skill.modifier));
    }
  }, [editingField, skill.modifier]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: 'none' as const,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`grid select-none grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 border-2 border-[#5d4a7a] bg-[#1b1522] p-3 shadow-[4px_4px_0_0_#09070d] ${isDragging ? 'opacity-60' : 'cursor-grab active:cursor-grabbing'}`}
      {...attributes}
      {...listeners}
    >
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        className="border border-[#7d6b95] bg-[#251d2e] px-2 py-2 text-[10px] text-[#f7ead4]"
      >
        ⋮⋮
      </button>

      {editingField === 'label' ? (
        <input
          ref={labelInputRef}
          value={skill.label}
          onChange={(event) => onUpdateLabel(skill.id, event.target.value)}
          onBlur={() => setEditingField(null)}
          className="min-w-0 select-text border-2 border-[#7d6b95] bg-[#120e17] px-3 py-2 text-[10px] text-[#f7ead4] outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingField('label')}
          className="min-w-0 text-left text-[10px] text-[#f7ead4]"
        >
          {skill.label || 'Unnamed skill'}
        </button>
      )}

      {editingField === 'modifier' ? (
        <input
          ref={modifierInputRef}
          type="number"
          inputMode="numeric"
          value={modifierDraft}
          onChange={(event) => {
            const nextValue = event.target.value;
            setModifierDraft(nextValue);
            const parsedValue = Number(nextValue);
            if (nextValue !== '' && Number.isFinite(parsedValue)) {
              onUpdateModifier(skill.id, Math.trunc(parsedValue));
            }
          }}
          onBlur={() => setEditingField(null)}
          className="w-20 select-text border-2 border-[#7dd3fc] bg-[#102a3a] px-3 py-2 text-[10px] text-[#d9f3ff] outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingField('modifier')}
          className="min-w-14 border-2 border-[#7dd3fc] bg-[#102a3a] px-3 py-2 text-[10px] text-[#d9f3ff]"
        >
          {formatModifier(skill.modifier)}
        </button>
      )}

      <button
        type="button"
        aria-label={`Remove ${skill.label}`}
        onClick={() => onRemove(skill.id)}
        className="border-2 border-[#ff9aa2] bg-[#35181f] px-3 py-2 text-[10px] text-[#ffe3e6]"
      >
        ✕
      </button>
    </article>
  );
}

export default function SkillListEditor({
  skills,
  onAddSkill,
  onRemoveSkill,
  onUpdateLabel,
  onUpdateModifier,
  onReorderSkills,
}: {
  skills: ProfileSkill[];
  onAddSkill: () => void;
  onRemoveSkill: (skillId: string) => void;
  onUpdateLabel: (skillId: string, label: string) => void;
  onUpdateModifier: (skillId: string, modifier: number) => void;
  onReorderSkills: (activeSkillId: string, overSkillId: string) => void;
}) {
  const skillIds = useMemo(() => skills.map((skill) => skill.id), [skills]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    onReorderSkills(String(active.id), String(over.id));
  };

  return (
    <div className="border-2 border-[#8a72a8] bg-[#15111a] p-4 shadow-[6px_6px_0_0_#09070d]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[#c5d7ff]">Skill Editor</p>
        <button
          type="button"
          onClick={onAddSkill}
          className="border-2 border-[#86efac] bg-[#17301f] px-3 py-2 text-[10px] text-[#d7ffe5]"
        >
          + Add Skill
        </button>
      </div>

      {skills.length === 0 ? (
        <div className="mt-4 border-2 border-dashed border-[#5d4a7a] bg-[#1b1522] px-4 py-8 text-center text-[10px] leading-relaxed text-[#c5b7d8]">
          No skills yet. Add one to start building this character sheet.
        </div>
      ) : (
        <DndContext collisionDetection={closestCenter} sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext items={skillIds} strategy={rectSortingStrategy}>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {skills.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  onRemove={onRemoveSkill}
                  onUpdateLabel={onUpdateLabel}
                  onUpdateModifier={onUpdateModifier}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}