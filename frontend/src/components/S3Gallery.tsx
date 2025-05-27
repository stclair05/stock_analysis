import React, { useEffect, useState } from "react";

interface S3GalleryProps {
  folder?: string; // e.g., "natgas" or "oil"
}

const S3Gallery: React.FC<S3GalleryProps> = ({ folder = "natgas" }) => {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`http://localhost:8000/s3-images?prefix=${folder}/`)
      .then((res) => res.json())
      .then((data) => {
        setImages(data.images || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [folder]);

  if (loading) return <div>Loading images…</div>;
  if (!images.length) return <div>No images found.</div>;

  return (
    <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", margin: "2rem 0" }}>
      {images.map((url) => (
        <img
          key={url}
          src={url}
          alt={folder.charAt(0).toUpperCase() + folder.slice(1)}
          style={{
            maxWidth: "100%",
            width: "100%",
            height: "auto",
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            objectFit: "contain",
          }}
        />
      ))}
    </div>
  );
};

export default S3Gallery;
