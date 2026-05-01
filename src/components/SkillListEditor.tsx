import { useEffect, useRef, useState } from 'react';
import { DndContext, PointerSensor, closestCenter, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ProfileSkill } from '../types/profile';
import { getSkillColumn, partitionSkillsByColumn, type SkillColumn } from '../utils/profileSkills';

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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: skill.id,
    data: { column: getSkillColumn(skill) },
  });
  const [editingField, setEditingField] = useState<'label' | 'modifier' | null>(null);
  const [labelDraft, setLabelDraft] = useState(skill.label);
  const [modifierDraft, setModifierDraft] = useState(String(skill.modifier));
  const labelInputRef = useRef<HTMLInputElement | null>(null);
  const modifierInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingField !== 'label') {
      setLabelDraft(skill.label);
      return;
    }

    labelInputRef.current?.focus();
    labelInputRef.current?.select();
  }, [editingField, skill.label]);

  useEffect(() => {
    if (editingField !== 'modifier') {
      setModifierDraft(String(skill.modifier));
      return;
    }

    modifierInputRef.current?.focus();
    modifierInputRef.current?.select();
  }, [editingField]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: 'none' as const,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`grid select-none grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1.5 px-1 py-1 ${isDragging ? 'opacity-60' : ''}`}
    >
      <button
        type="button"
        aria-label={`Drag ${skill.label}`}
        className="border border-[#7d6b95] bg-[#251d2e] px-1.5 py-1 text-[7px] leading-none text-[#f7ead4] cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>

      {editingField === 'label' ? (
        <input
          ref={labelInputRef}
          value={labelDraft}
          onChange={(event) => setLabelDraft(event.target.value)}
          onBlur={() => {
            onUpdateLabel(skill.id, labelDraft)
            setEditingField(null)
          }}
          className="min-w-0 select-text border border-[#7d6b95] bg-[#120e17] px-2 py-1 text-[7px] text-[#f7ead4] outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingField('label')}
          className="min-w-0 truncate text-left text-[7px] leading-tight text-[#f7ead4]"
        >
          {skill.label || 'Unnamed skill'}
        </button>
      )}

      {editingField === 'modifier' ? (
        <input
          ref={modifierInputRef}
          type="text"
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
          className="w-14 select-text border border-[#7dd3fc] bg-[#102a3a] px-2 py-1 text-[7px] text-[#d9f3ff] outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingField('modifier')}
          className="min-w-10 border border-[#7dd3fc] bg-[#102a3a] px-2 py-1 text-[7px] text-[#d9f3ff]"
        >
          {formatModifier(skill.modifier)}
        </button>
      )}

      <button
        type="button"
        aria-label={`Remove ${skill.label}`}
        onClick={() => onRemove(skill.id)}
        className="border border-[#ff9aa2] bg-[#35181f] px-2 py-1 text-[7px] text-[#ffe3e6]"
      >
        ✕
      </button>
    </article>
  );
}

function SkillColumn({
  column,
  columnSkills,
  onRemoveSkill,
  onUpdateLabel,
  onUpdateModifier,
}: {
  column: SkillColumn;
  columnSkills: ProfileSkill[];
  onRemoveSkill: (skillId: string) => void;
  onUpdateLabel: (skillId: string, label: string) => void;
  onUpdateModifier: (skillId: string, modifier: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column,
    data: { column },
  });

  return (
    <div ref={setNodeRef} className={`min-h-6 space-y-1.5 min-w-0 ${isOver ? 'bg-[#1a1421]' : ''}`}>
      <SortableContext items={columnSkills.map((skill) => skill.id)} strategy={rectSortingStrategy}>
        {columnSkills.map((skill) => (
          <SkillCard
            key={skill.id}
            skill={skill}
            onRemove={onRemoveSkill}
            onUpdateLabel={onUpdateLabel}
            onUpdateModifier={onUpdateModifier}
          />
        ))}
      </SortableContext>
    </div>
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
  onReorderSkills: (activeSkillId: string, targetColumn: SkillColumn, overSkillId?: string | null) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const targetColumn = (over.data.current?.column as SkillColumn | undefined) ?? (String(over.id) === 'left' ? 'left' : 'right');
    const overSkillId = String(over.id) === 'left' || String(over.id) === 'right' ? null : String(over.id);

    onReorderSkills(String(active.id), targetColumn, overSkillId);
  };

  const { left: leftSkills, right: rightSkills } = partitionSkillsByColumn(skills);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[7px] uppercase tracking-[0.18em] text-[#c5d7ff]">Skill Editor</p>
        <button
          type="button"
          onClick={onAddSkill}
          className="border border-[#86efac] bg-[#17301f] px-2.5 py-1.5 text-[7px] text-[#d7ffe5]"
        >
          + Add Skill
        </button>
      </div>

      {skills.length === 0 ? (
        <div className="text-center text-[7px] leading-relaxed text-[#c5b7d8]">
          No skills yet. Add one to start building this character sheet.
        </div>
      ) : (
        <DndContext collisionDetection={closestCenter} sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] gap-2">
            <SkillColumn
              column="left"
              columnSkills={leftSkills}
              onRemoveSkill={onRemoveSkill}
              onUpdateLabel={onUpdateLabel}
              onUpdateModifier={onUpdateModifier}
            />
            <div className="bg-[#4d3d61]" aria-hidden="true" />
            <SkillColumn
              column="right"
              columnSkills={rightSkills}
              onRemoveSkill={onRemoveSkill}
              onUpdateLabel={onUpdateLabel}
              onUpdateModifier={onUpdateModifier}
            />
          </div>
        </DndContext>
      )}
    </div>
  );
}