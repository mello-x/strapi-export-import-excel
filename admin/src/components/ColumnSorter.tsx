import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Box, Button, Flex, Typography } from "@strapi/design-system";

interface ColumnChipProps {
  col: string;
  onDelete: (col: string) => void;
}

const ColumnChip = ({ col, onDelete }: ColumnChipProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col });

  return (
    <div
      ref={setNodeRef}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "4px 8px 4px 12px",
        borderRadius: "16px",
        border: isDragging ? "2px solid #4945FF" : "1px solid #C0C0CF",
        background: isDragging ? "#F0F0FF" : "#FFFFFF",
        opacity: isDragging ? 0.5 : 1,
        cursor: "grab",
        transform: CSS.Transform.toString(transform),
        transition,
        userSelect: "none",
      }}
      {...attributes}
      {...listeners}
    >
      <span style={{ fontSize: "13px", color: "#32324D" }}>{col}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(col);
        }}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "0 2px",
          lineHeight: 1,
          color: "#8E8EA9",
          fontSize: "16px",
          fontWeight: "bold",
          display: "flex",
          alignItems: "center",
        }}
        aria-label={`Remove ${col} column`}
        title={`Remove ${col}`}
      >
        ×
      </button>
    </div>
  );
};

interface ColumnSorterProps {
  columns: string[];
  onColumnsReorder: (columns: string[]) => void;
  onColumnDelete: (column: string) => void;
  onResetColumns: () => void;
  originalColumnsCount: number;
}

const ColumnSorter = ({
  columns,
  onColumnsReorder,
  onColumnDelete,
  onResetColumns,
  originalColumnsCount,
}: ColumnSorterProps) => {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = columns.indexOf(String(active.id));
    const newIndex = columns.indexOf(String(over.id));
    onColumnsReorder(arrayMove(columns, oldIndex, newIndex));
  };

  return (
    <Box>
      <Flex justifyContent="space-between" alignItems="center" paddingBottom={3}>
        <Typography variant="sigma" textColor="neutral600">
          Columns ({columns.length}/{originalColumnsCount}) — drag to reorder, × to remove
        </Typography>
        {columns.length < originalColumnsCount && (
          <Button variant="ghost" size="S" onClick={onResetColumns}>
            Reset columns
          </Button>
        )}
      </Flex>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={columns} strategy={horizontalListSortingStrategy}>
          <Flex gap={2} style={{ flexWrap: "wrap", minHeight: "40px" }}>
            {columns.map((col) => (
              <ColumnChip key={col} col={col} onDelete={onColumnDelete} />
            ))}
            {columns.length === 0 && (
              <Typography textColor="neutral400" variant="omega">
                All columns removed. Click "Reset columns" to restore.
              </Typography>
            )}
          </Flex>
        </SortableContext>
      </DndContext>
    </Box>
  );
};

export { ColumnSorter };
