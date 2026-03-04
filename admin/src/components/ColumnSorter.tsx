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
import { Box, Button, Flex, IconButton, Typography } from "@strapi/design-system";
import { Cross, Drag } from "@strapi/icons";

interface ColumnSorterProps {
  columns: string[];
  onColumnsReorder: (newOrder: string[]) => void;
  onColumnDelete: (columnToDelete: string) => void;
  onResetColumns: () => void;
  originalColumnsCount: number;
}

interface SortableChipProps {
  id: string;
  onDelete: (id: string) => void;
}

const SortableChip = ({ id, onDelete }: SortableChipProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <Flex
      ref={setNodeRef}
      gap={1}
      alignItems="center"
      justifyContent="space-between"
      style={{
        minHeight: "48px",
        paddingTop: "2px",
        paddingBottom: "2px",
        paddingLeft: "4px",
        paddingRight: "12px",
        border: isDragging ? "2px solid #4945ff" : "1px solid #dcdce4",
        borderRadius: "4px",
        backgroundColor: isDragging ? "#f0f0ff" : "#ecebeb",
        boxShadow: isDragging ? "0 8px 16px rgba(0, 0, 0, 0.15)" : "0 4px 8px rgba(50, 128, 72, 0.15)",
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.8 : 1,
        cursor: "default",
      }}
    >
      <span
        {...attributes}
        {...listeners}
        style={{
          cursor: "grab",
          color: isDragging ? "#4945ff" : "#8e8ea9",
          display: "flex",
          alignItems: "center",
          padding: "4px",
        }}
      >
        <Drag />
      </span>
      <Typography variant="pi" textColor="#252525">
        {id}
      </Typography>
      <IconButton
        onClick={() => onDelete(id)}
        label={`Delete ${id} column`}
        variant="ghost"
        size="S"
        style={{ color: "#ee5a52", marginLeft: "8px", padding: "4px" }}
      >
        <Cross />
      </IconButton>
    </Flex>
  );
};

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
      <Flex direction="column" gap={1} marginBottom={4} alignItems="start">
        <Flex justifyContent="space-between" alignItems="center" style={{ width: "100%" }}>
          <Typography variant="delta">Column Order</Typography>
          {columns.length < originalColumnsCount && (
            <Button onClick={onResetColumns} variant="tertiary" size="S">
              Reset All Columns
            </Button>
          )}
        </Flex>
        <Typography variant="omega" textColor="neutral600">
          Drag and drop to reorder columns for the table and Excel export
        </Typography>
      </Flex>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={columns} strategy={horizontalListSortingStrategy}>
          <Flex direction="row" gap={3} wrap="wrap">
            {columns.map((column) => (
              <SortableChip key={column} id={column} onDelete={onColumnDelete} />
            ))}
          </Flex>
        </SortableContext>
      </DndContext>
    </Box>
  );
};

export { ColumnSorter };
