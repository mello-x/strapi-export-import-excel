import { Box, Flex, Toggle, Typography } from "@strapi/design-system";
import { Drag } from "@strapi/icons";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface FieldConfig {
  key: string;
  label: string;
  enabled: boolean;
}

interface SortableFieldItemProps {
  field: FieldConfig;
  onToggle: (key: string) => void;
}

const SortableFieldItem = ({ field, onToggle }: SortableFieldItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.key });

  return (
    <div
      ref={setNodeRef}
      style={{
        borderRadius: "4px",
        marginBottom: "4px",
        opacity: isDragging ? 0.4 : 1,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <Flex alignItems="center" gap={3} padding={2}>
        <span
          {...attributes}
          {...listeners}
          style={{ cursor: "grab", color: "#8E8EA9", display: "flex", alignItems: "center" }}
        >
          <Drag />
        </span>
        <Toggle
          checked={field.enabled}
          onChange={() => onToggle(field.key)}
          onLabel="Include"
          offLabel="Exclude"
        />
        <Typography style={{ color: field.enabled ? "inherit" : "#8E8EA9" }}>
          {field.label}
        </Typography>
      </Flex>
    </div>
  );
};

interface DraggableFieldListProps {
  title: string;
  fields: FieldConfig[];
  onChange: (fields: FieldConfig[]) => void;
}

const DraggableFieldList = ({ title, fields, onChange }: DraggableFieldListProps) => {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex((field) => field.key === active.id);
    const newIndex = fields.findIndex((field) => field.key === over.id);
    onChange(arrayMove(fields, oldIndex, newIndex));
  };

  const handleToggle = (key: string) => {
    onChange(fields.map((field) => (field.key === key ? { ...field, enabled: !field.enabled } : field)));
  };

  return (
    <Box flex={1}>
      <Typography variant="delta" style={{ marginBottom: "12px", display: "block" }}>
        {title}
      </Typography>
      <Box style={{ borderTop: "2px solid #E3E3E8", paddingTop: "12px", minHeight: "200px" }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={fields.map((field) => field.key)} strategy={verticalListSortingStrategy}>
            {fields.map((field) => (
              <SortableFieldItem key={field.key} field={field} onToggle={handleToggle} />
            ))}
          </SortableContext>
        </DndContext>
        {fields.length === 0 && (
          <Typography style={{ color: "#8E8EA9" }}>No fields available</Typography>
        )}
      </Box>
    </Box>
  );
};

export { DraggableFieldList };
