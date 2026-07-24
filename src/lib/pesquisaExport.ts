import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { PesquisaMercado, PesquisaTerreno } from "@/hooks/usePesquisasMercado";

const BRAND_ORANGE: [number, number, number] = [254, 80, 9];
const BRAND_BLUE: [number, number, number] = [6, 27, 57];

const fmtCurrency = (v: number | null | undefined) =>
  v != null && !isNaN(Number(v))
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v))
    : "-";

const fmtNumber = (v: number | null | undefined) =>
  v != null && !isNaN(Number(v))
    ? new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(Number(v))
    : "-";

async function buildSatelliteWithPins(terrenos: PesquisaTerreno[]): Promise<string | null> {
  const pins = terrenos.filter((t) => t.latitude != null && t.longitude != null);
  if (pins.length === 0) return null;

  const lats = pins.map((t) => t.latitude as number);
  const lons = pins.map((t) => t.longitude as number);
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  let minLon = Math.min(...lons);
  let maxLon = Math.max(...lons);

  // Ensure minimum area + padding around markers
  const latRange = Math.max(maxLat - minLat, 0.008);
  const lonRange = Math.max(maxLon - minLon, 0.008);
  const cy = (minLat + maxLat) / 2;
  const cx = (minLon + maxLon) / 2;
  const halfLat = latRange * 0.7;
  const halfLon = lonRange * 0.7;
  minLat = cy - halfLat;
  maxLat = cy + halfLat;
  minLon = cx - halfLon;
  maxLon = cx + halfLon;

  const W = 900;
  const H = 700;
  const url = `https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export?bbox=${minLon},${minLat},${maxLon},${maxLat}&bboxSR=4326&imageSR=4326&size=${W},${H}&format=jpg&f=image`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const dataUrl: string = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = rej;
      r.readAsDataURL(blob);
    });

    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.crossOrigin = "anonymous";
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = dataUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, W, H);

    pins.forEach((t, idx) => {
      const x = ((Number(t.longitude) - minLon) / (maxLon - minLon)) * W;
      const y = H - ((Number(t.latitude) - minLat) / (maxLat - minLat)) * H;
      // shadow
      ctx.beginPath();
      ctx.arc(x + 1, y + 2, 16, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fill();
      // pin
      ctx.beginPath();
      ctx.arc(x, y, 15, 0, Math.PI * 2);
      ctx.fillStyle = "#FE5009";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.fill();
      ctx.stroke();
      // label
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(idx + 1), x, y);
    });

    return canvas.toDataURL("image/jpeg", 0.9);
  } catch (e) {
    console.error("Erro ao gerar satélite:", e);
    return null;
  }
}

export async function exportPesquisaToPdf(
  pesquisa: PesquisaMercado,
  terrenos: PesquisaTerreno[]
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Header
  doc.setFillColor(BRAND_BLUE[0], BRAND_BLUE[1], BRAND_BLUE[2]);
  doc.rect(0, 0, pageWidth, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Pesquisa de Mercado", 14, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(pesquisa.nome, 14, 20);

  doc.setTextColor(0, 0, 0);
  let y = 36;
  doc.setFontSize(10);
  doc.text(`Cidade: ${pesquisa.cidade?.nome || "-"}`, 14, y);
  y += 5;
  const dataStr = pesquisa.data_pesquisa
    ? format(new Date(pesquisa.data_pesquisa + "T00:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
    : "-";
  doc.text(`Data da pesquisa: ${dataStr}`, 14, y);
  y += 5;
  doc.text(`Total de terrenos: ${terrenos.length}`, 14, y);
  y += 6;
  if (pesquisa.observacoes) {
    doc.setFont("helvetica", "bold");
    doc.text("Observações:", 14, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(pesquisa.observacoes, pageWidth - 28);
    doc.text(lines, 14, y);
    y += lines.length * 4 + 4;
  }

  // Satellite
  const satImg = await buildSatelliteWithPins(terrenos);
  if (satImg) {
    if (y > 160) {
      doc.addPage();
      y = 20;
    }
    doc.setTextColor(BRAND_ORANGE[0], BRAND_ORANGE[1], BRAND_ORANGE[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Localização dos terrenos", 14, y);
    y += 4;
    doc.setTextColor(0, 0, 0);
    const imgW = pageWidth - 28;
    const imgH = imgW * (700 / 900);
    doc.addImage(satImg, "JPEG", 14, y, imgW, imgH);
    y += imgH + 6;
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text("Imagem: ESRI World Imagery", 14, y);
    doc.setTextColor(0, 0, 0);
    y += 6;
  }

  // Table
  if (y > pageHeight - 60) {
    doc.addPage();
    y = 20;
  }
  doc.setTextColor(BRAND_ORANGE[0], BRAND_ORANGE[1], BRAND_ORANGE[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Terrenos pesquisados", 14, y);
  doc.setTextColor(0, 0, 0);

  autoTable(doc, {
    startY: y + 3,
    head: [["#", "Nome", "Preço", "m²", "R$/m²", "Tipo", "Condições"]],
    body: terrenos.map((t, i) => [
      String(i + 1),
      t.nome,
      fmtCurrency(t.preco),
      fmtNumber(t.tamanho_m2),
      t.preco && t.tamanho_m2 ? fmtCurrency(Number(t.preco) / Number(t.tamanho_m2)) : "-",
      t.tipo_terreno || "-",
      t.condicoes_pagamento || "-",
    ]),
    headStyles: { fillColor: BRAND_BLUE, textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 8, halign: "center" } },
    margin: { left: 14, right: 14 },
  });

  // Extra details per terreno
  const lastY = (doc as any).lastAutoTable?.finalY ?? y + 40;
  let dy = lastY + 8;
  const hasExtras = terrenos.some((t) => t.observacoes || t.url_anuncio || t.latitude != null);
  if (hasExtras) {
    if (dy > pageHeight - 30) {
      doc.addPage();
      dy = 20;
    }
    doc.setTextColor(BRAND_ORANGE[0], BRAND_ORANGE[1], BRAND_ORANGE[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Detalhes adicionais", 14, dy);
    doc.setTextColor(0, 0, 0);
    dy += 5;

    terrenos.forEach((t, i) => {
      const parts: string[] = [];
      if (t.latitude != null && t.longitude != null) {
        parts.push(`Coordenadas: ${Number(t.latitude).toFixed(6)}, ${Number(t.longitude).toFixed(6)}`);
      }
      if (t.url_anuncio) parts.push(`Link: ${t.url_anuncio}`);
      if (t.observacoes) parts.push(`Obs: ${t.observacoes}`);
      if (parts.length === 0) return;

      if (dy > pageHeight - 20) {
        doc.addPage();
        dy = 20;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(`#${i + 1} — ${t.nome}`, 14, dy);
      dy += 4;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      parts.forEach((line) => {
        const wrapped = doc.splitTextToSize(line, pageWidth - 28);
        if (dy + wrapped.length * 4 > pageHeight - 15) {
          doc.addPage();
          dy = 20;
        }
        doc.text(wrapped, 14, dy);
        dy += wrapped.length * 4 + 1;
      });
      dy += 2;
    });
  }

  // Footer with page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Página ${i} de ${pageCount} — Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}`,
      pageWidth / 2,
      pageHeight - 6,
      { align: "center" }
    );
  }

  const safeName = pesquisa.nome.replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").toLowerCase();
  doc.save(`pesquisa-mercado-${safeName}.pdf`);
}
