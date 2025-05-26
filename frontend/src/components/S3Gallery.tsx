import React, { useEffect, useState } from "react";

const S3Gallery: React.FC = () => {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://localhost:8000/s3-images") // Adjust if your backend runs on a different port or domain
      .then((res) => res.json())
      .then((data) => {
        setImages(data.images || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div>Loading images…</div>;
  if (!images.length) return <div>No images found.</div>;

  return (
    <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", margin: "2rem 0" }}>
      {images.map((url) => (
        <img
          key={url}
          src={url}
          alt="Natural Gas"
          style={{
             maxWidth: "100%",      // ← Try 600px or 100%
            width: "100%",          // ← Ensures it fills the container
            height: "auto",         // ← Maintains aspect ratio
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            objectFit: "contain"    // ← "cover" will crop, "contain" will fit whole image
          }}
        />
      ))}
    </div>
  );
};

export default S3Gallery;
