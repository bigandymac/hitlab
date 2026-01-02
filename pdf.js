import PDFDocument from "pdfkit"; import { createWriteStream } from "fs"; import path from "path";
export async function makeBrandRolloutPDF({ outDir, artist, track, goals, audience }) {
  const safe = `${artist || "Artist"}-${track?.title || "Track"}`.replace(/[^a-z0-9_\-]/gi, "_");
  const filePath = path.join(outDir, `${safe}.pdf`);
  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const stream = createWriteStream(filePath);
    doc.pipe(stream);
    doc.fontSize(20).text("HitLab Brand & Rollout Sheet", { underline: true });
    doc.moveDown();
    doc.fontSize(14).text(`Artist: ${artist}`);
    doc.text(`Track: ${track?.title}`);
    if (track?.lane) doc.text(`Lane: ${track.lane}`);
    if (track?.refs?.length) doc.text(`Refs: ${track.refs.join(", ")}`);
    if (audience) doc.text(`Audience: ${audience}`);
    doc.moveDown();
    doc.fontSize(16).text("Spotify Pitch (Draft):");
    doc.fontSize(12).text(`${track?.title} blends ${track?.lane || "your lane"} aesthetics with modern production.`);
    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
  return filePath;
}
