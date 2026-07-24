import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { STATUS_LABELS } from "@/hooks/useGlebas";

type Gleba = Tables<"glebas">;

const BRAND_ORANGE: [number, number, number] = [254, 80, 9];
const BRAND_BLUE: [number, number, number] = [6, 27, 57];

const fmtDate = (d: string | null | undefined) =>
  d ? format(new Date(d), "dd/MM/yyyy", { locale: ptBR }) : "-";

const fmtDateTime = (d: string | null | undefined) =>
  d ? format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "-";

const fmtCurrency = (v: number | null | undefined) =>
  v != null
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(v)
    : "-";

const fmtArea = (v: number | null | undefined, unit = "ha") =>
  v != null ? `${v.toLocaleString("pt-BR")} ${unit}` : "-";

export async function exportGlebaToPdf(gleba: Gleba) {
  // Fetch related data in parallel
  const [
    cidadeRes,
    imobRes,
    motivoRes,
    atividadesRes,
    propostasRes,
    anexosRes,
    profilesRes,
  ] = await Promise.all([
    gleba.cidade_id
      ? supabase.from("cidades").select("nome, uf").eq("id", gleba.cidade_id).maybeSingle()
      : Promise.resolve({ data: null } as any),
    gleba.imobiliaria_id
      ? supabase.from("imobiliarias").select("nome").eq("id", gleba.imobiliaria_id).maybeSingle()
      : Promise.resolve({ data: null } as any),
    (gleba as any).motivo_descarte_id
      ? supabase.from("motivos_descarte").select("nome").eq("id", (gleba as any).motivo_descarte_id).maybeSingle()
      : Promise.resolve({ data: null } as any),
    supabase
      .from("atividades")
      .select("id, data, descricao, responsavel_id, created_at, tipo_atividade:tipos_atividade(nome)")
      .eq("gleba_id", gleba.id)
      .order("data", { ascending: false }),
    supabase
      .from("propostas")
      .select("*")
      .eq("gleba_id", gleba.id)
      .order("data_proposta", { ascending: false }),
    supabase
      .from("gleba_anexos")
      .select("nome_arquivo, arquivo, created_at, tipo_arquivo:tipos_arquivo(nome)")
      .eq("gleba_id", gleba.id)
      .order("created_at", { ascending: false }),
    supabase.from("user_profiles").select("user_id, nome"),
  ]);

  const cidade = cidadeRes?.data as { nome: string; uf: string } | null;
  const imobiliaria = imobRes?.data as { nome: string } | null;
  const motivo = motivoRes?.data as { nome: string } | null;
  const atividades = atividadesRes.data ?? [];
  const propostas = propostasRes.data ?? [];
  const anexos = anexosRes.data ?? [];
  const profileMap = new Map<string, string>();
  (profilesRes.data ?? []).forEach((p: any) => profileMap.set(p.user_id, p.nome));

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 40;
  let y = 40;

  // Header bar
  doc.setFillColor(...BRAND_BLUE);
  doc.rect(0, 0, pageWidth, 70, "F");
  doc.setFillColor(...BRAND_ORANGE);
  doc.rect(0, 70, pageWidth, 4, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(`Gleba #${gleba.numero} - ${gleba.apelido}`, marginX, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const subtitle = [
    cidade ? `${cidade.nome}/${cidade.uf}` : null,
    STATUS_LABELS[gleba.status] || gleba.status,
    gleba.prioridade ? "Prioritária" : null,
  ]
    .filter(Boolean)
    .join("  •  ");
  doc.text(subtitle, marginX, 58);

  y = 100;
  doc.setTextColor(0, 0, 0);

  const section = (title: string) => {
    if (y > 760) {
      doc.addPage();
      y = 50;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...BRAND_BLUE);
    doc.text(title, marginX, y);
    doc.setDrawColor(...BRAND_ORANGE);
    doc.setLineWidth(1);
    doc.line(marginX, y + 3, pageWidth - marginX, y + 3);
    y += 14;
    doc.setTextColor(0, 0, 0);
  };

  const infoTable = (rows: [string, string][]) => {
    autoTable(doc, {
      startY: y,
      body: rows.filter(([, v]) => v && v !== "-"),
      theme: "plain",
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 160, textColor: [80, 80, 80] },
        1: { cellWidth: "auto" },
      },
      margin: { left: marginX, right: marginX },
    });
    y = (doc as any).lastAutoTable.finalY + 12;
  };

  // General info
  section("Informações Gerais");
  infoTable([
    ["Número", `#${gleba.numero}`],
    ["Apelido", gleba.apelido],
    ["Status", STATUS_LABELS[gleba.status] || gleba.status],
    ["Prioritária", gleba.prioridade ? "Sim" : "Não"],
    ["Cidade", cidade ? `${cidade.nome}/${cidade.uf}` : "-"],
    ["Proprietário", gleba.proprietario_nome || "-"],
    ["Telefone", (gleba as any).proprietario_telefone || "-"],
    ["Imobiliária", imobiliaria?.nome || "-"],
    ["Área total", fmtArea(gleba.tamanho_m2)],
    ["Lote mínimo", fmtArea((gleba as any).tamanho_lote_minimo, "m²")],
    ["Zona do Plano Diretor", (gleba as any).zona_plano_diretor || "-"],
    ["Possui polígono", gleba.poligono_geojson || gleba.arquivo_kmz ? "Sim" : "Não"],
  ]);

  // Comercial
  section("Informações Comerciais");
  infoTable([
    ["Preço", fmtCurrency(gleba.preco)],
    [
      "Aceita permuta",
      gleba.aceita_permuta === "sim"
        ? (gleba as any).percentual_permuta
          ? `Sim (${(gleba as any).percentual_permuta}%)`
          : "Sim"
        : gleba.aceita_permuta === "nao"
        ? "Não"
        : "Incerto",
    ],
    ["Data da visita", fmtDate(gleba.data_visita)],
    ["Data de fechamento", fmtDate((gleba as any).data_fechamento)],
  ]);

  // Datas
  section("Datas");
  infoTable([
    ["Criado em", fmtDateTime(gleba.created_at)],
    ["Última atualização", fmtDateTime(gleba.updated_at)],
    ["Última sincronização", fmtDateTime(gleba.last_sync_at)],
  ]);

  // Comentarios / Informações da Gleba
  if (gleba.comentarios) {
    section("Informações da Gleba");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(gleba.comentarios, pageWidth - marginX * 2);
    doc.text(lines, marginX, y);
    y += lines.length * 12 + 8;
  }

  // Descarte / Standby
  if (gleba.status === "descartada") {
    section("Descarte");
    infoTable([
      ["Motivo", motivo?.nome || "-"],
      ["Descrição", (gleba as any).descricao_descarte || "-"],
    ]);
  }
  if (gleba.status === "standby") {
    section("Standby");
    infoTable([
      ["Início", fmtDate((gleba as any).standby_inicio)],
      ["Motivo", (gleba as any).standby_motivo || "-"],
    ]);
  }

  // Arquivos
  const arquivos: [string, string][] = [];
  if (gleba.arquivo_kmz) arquivos.push(["KMZ", gleba.arquivo_kmz]);
  if ((gleba as any).arquivo_protocolo) arquivos.push(["Protocolo", (gleba as any).arquivo_protocolo]);
  if ((gleba as any).arquivo_contrato) arquivos.push(["Contrato", (gleba as any).arquivo_contrato]);
  if ((gleba as any).google_drive_folder_id)
    arquivos.push([
      "Pasta Google Drive",
      `https://drive.google.com/drive/folders/${(gleba as any).google_drive_folder_id}`,
    ]);

  if (arquivos.length) {
    section("Arquivos e Links");
    autoTable(doc, {
      startY: y,
      head: [["Tipo", "Link"]],
      body: arquivos,
      theme: "striped",
      styles: { fontSize: 9, cellPadding: 4, overflow: "linebreak" },
      headStyles: { fillColor: BRAND_BLUE, textColor: 255 },
      columnStyles: { 0: { cellWidth: 120, fontStyle: "bold" }, 1: { cellWidth: "auto", textColor: [0, 0, 200] } },
      margin: { left: marginX, right: marginX },
      didDrawCell: (data) => {
        if (data.section === "body" && data.column.index === 1) {
          const url = String(data.cell.raw ?? "");
          if (url.startsWith("http")) {
            doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
          }
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 12;
  }

  // Anexos
  if (anexos.length) {
    section(`Documentos Anexos (${anexos.length})`);
    autoTable(doc, {
      startY: y,
      head: [["Arquivo", "Tipo", "Data"]],
      body: anexos.map((a: any) => [
        a.nome_arquivo || "-",
        a.tipo_arquivo?.nome || "-",
        fmtDate(a.created_at),
      ]),
      theme: "striped",
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: BRAND_BLUE, textColor: 255 },
      margin: { left: marginX, right: marginX },
    });
    y = (doc as any).lastAutoTable.finalY + 12;
  }

  // Propostas
  if (propostas.length) {
    section(`Propostas (${propostas.length})`);
    autoTable(doc, {
      startY: y,
      head: [["Data", "Tipo", "Valor", "Descrição"]],
      body: propostas.map((p: any) => [
        fmtDate(p.data_proposta),
        p.tipo || "-",
        fmtCurrency(p.valor),
        p.descricao || "-",
      ]),
      theme: "striped",
      styles: { fontSize: 9, cellPadding: 4, overflow: "linebreak" },
      headStyles: { fillColor: BRAND_BLUE, textColor: 255 },
      columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 70 }, 2: { cellWidth: 90 } },
      margin: { left: marginX, right: marginX },
    });
    y = (doc as any).lastAutoTable.finalY + 12;
  }

  // Histórico de Atividades
  if (atividades.length) {
    section(`Histórico de Atividades (${atividades.length})`);
    autoTable(doc, {
      startY: y,
      head: [["Data", "Tipo", "Responsável", "Descrição"]],
      body: atividades.map((a: any) => [
        fmtDate(a.data),
        a.tipo_atividade?.nome || "-",
        profileMap.get(a.responsavel_id) || "-",
        a.descricao || "-",
      ]),
      theme: "striped",
      styles: { fontSize: 9, cellPadding: 4, overflow: "linebreak" },
      headStyles: { fillColor: BRAND_BLUE, textColor: 255 },
      columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 90 }, 2: { cellWidth: 100 } },
      margin: { left: marginX, right: marginX },
    });
    y = (doc as any).lastAutoTable.finalY + 12;
  }

  // Footer com paginação
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    const footer = `Perdigueiro • Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })} • Página ${i}/${pageCount}`;
    doc.text(footer, pageWidth / 2, doc.internal.pageSize.getHeight() - 20, { align: "center" });
  }

  const safeName = gleba.apelido.replace(/[^\w\-]+/g, "_");
  doc.save(`Gleba_${gleba.numero}_${safeName}.pdf`);
}
