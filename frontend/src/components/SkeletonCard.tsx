import React from "react";

const SkeletonCard = ({ type = "standard" }: { type?: "standard" | "metrics" | "chart" }) => {
  if (type === "chart") {
    return (
      <div className="bg-light rounded shadow-sm p-4 mb-3 w-100">
        <div className="placeholder col-3 mb-3"></div>
        <div className="placeholder col-12" style={{ height: "400px" }}></div>
      </div>
    );
  }

  return (
    <div>
      {type === "standard" && (
        <div className="row g-4 mb-4">
          {[1, 2, 3, 4].map((i) => (
            <div className="col-md-3" key={i}>
              <div className="p-4 rounded bg-light shadow-sm placeholder-glow h-100">
                <div className="placeholder col-6 mb-2"></div>
                <div className="placeholder col-8"></div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="bg-light rounded shadow-sm p-4 mb-3">
        <div className="placeholder col-4 mb-3"></div>
        <div
          className="placeholder col-12"
          style={{ height: type === "metrics" ? "300px" : "160px" }}
        ></div>
      </div>
    </div>
  );
};

export default SkeletonCard;
