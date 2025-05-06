import React from "react";
import { Pencil, MousePointerClick, Trash2 } from "lucide-react";

type DrawingToolbarProps = {
  drawingEnabled: boolean;
  setDrawingEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  clearTrendLines: () => void;
  selectedColor: string;
  setSelectedColor: React.Dispatch<React.SetStateAction<string>>;
};

const DrawingToolbar: React.FC<DrawingToolbarProps> = ({
  drawingEnabled,
  setDrawingEnabled,
  clearTrendLines,
  selectedColor,
  setSelectedColor,
}) => {
  return (
    <div
      style={{
        display: "flex",
        gap: "8px",
        justifyContent: "flex-end",
        alignItems: "center",
        marginBottom: "8px",
        padding: "6px 8px",
        backgroundColor: "#f2f2f2",
        borderRadius: "6px",
        border: "1px solid #ddd",
        width: "fit-content",
        marginLeft: "auto",
      }}
    >
      <button
        onClick={() => setDrawingEnabled(!drawingEnabled)}
        title={drawingEnabled ? "Exit Draw Mode" : "Draw Line"}
        style={{
          border: "none",
          background: drawingEnabled ? "#e0f7fa" : "transparent",
          borderRadius: "4px",
          padding: "4px",
          cursor: "pointer",
        }}
      >
        {drawingEnabled ? <MousePointerClick size={18} /> : <Pencil size={18} />}
      </button>
      <button
        onClick={clearTrendLines}
        title="Clear All Lines"
        style={{
          border: "none",
          background: "transparent",
          borderRadius: "4px",
          padding: "4px",
          cursor: "pointer",
        }}
      >
        <Trash2 size={18} color="#d32f2f" />
      </button>
      <input
        type="color"
        title="Line Color"
        value={selectedColor}
        onChange={(e) => setSelectedColor(e.target.value)}
        style={{
          width: "22px",
          height: "22px",
          padding: "0",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      />
    </div>
  );
};

export default DrawingToolbar;
