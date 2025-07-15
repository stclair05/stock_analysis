import React, { useEffect, useState } from "react";

interface S3GalleryProps {
  folder?: string; // e.g., "natgas" or "oil"
}

const S3Gallery: React.FC<S3GalleryProps> = ({ folder = "natgas" }) => {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/s3-images?prefix=${folder}/`)
      .then((res) => res.json())
      .then((data) => {
        console.log("Original images:", data.images); // <--- see what you get
        const sortImages = (images: string[]) => {
          return images.slice().sort((a, b) => {
            // Always get the filename portion from the URL
            const fileA = a.split("/").pop() || a;
            const fileB = b.split("/").pop() || b;
            // Extract the number after "copper_" (handles decimals like 11.5)
            const matchA = fileA.match(/copper_(\d+(\.\d+)?)/);
            const matchB = fileB.match(/copper_(\d+(\.\d+)?)/);
            const numA = matchA ? parseFloat(matchA[1]) : 0;
            const numB = matchB ? parseFloat(matchB[1]) : 0;
            return numA - numB;
          });
        };
        const sorted = sortImages(data.images || []);
        console.log("Sorted images:", sorted); // <--- see the result
        setImages(sorted);
        setLoading(false);
      })

      .catch(() => setLoading(false));
  }, [folder]);

  if (loading) return <div>Loading images…</div>;
  if (!images.length) return <div>No images found.</div>;

  return (
    <div
      style={{
        display: "flex",
        gap: "1.5rem",
        flexWrap: "wrap",
        margin: "2rem 0",
      }}
    >
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
