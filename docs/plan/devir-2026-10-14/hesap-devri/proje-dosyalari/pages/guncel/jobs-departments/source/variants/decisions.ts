// The decisions the V1 variants carry. Each numbered marker on the page points
// at one of these lines in the lab's legend.
export type DecisionState = "chosen" | "pending" | "pick" | "code";

export interface Decision {
  readonly n: number;
  readonly state: DecisionState;
  readonly what: string;
  /** "Seçildi · tarih · kaynak" style line. */
  readonly source: string;
}

export const stateLabel: Record<DecisionState, string> = {
  chosen: "Seçildi",
  pending: "Kartta bekliyor",
  pick: "Bu sayfada seç",
  code: "Kodda",
};

export const decisions: readonly Decision[] = [
  {
    n: 1,
    state: "chosen",
    what: "Ortak liste dili: SETTINGS başlığı, Jobs · Departments · Archived sekmeleri, Department süzgeci + arama + yeşil New job, departman ara başlıklı tek tablo.",
    source: "2026-10-07 · Mert, Jobs V1 (\"Okay\")",
  },
  {
    n: 2,
    state: "chosen",
    what: "Bugünkü düz Jobs listesi (Department sütunlu) yok; tek departman için Department süzgeci kullanılır. (Soru 1)",
    source: "2026-10-06 · Mert, Requests \"her şey tek tabloda\" + Jobs V1",
  },
  {
    n: 3,
    state: "chosen",
    what: "Sütun başlığına basınca sıralanır (↕), departman grubunun içinde. Varsayılan sıra A→Z. (Soru 2)",
    source: "2026-10-05 · Mert, ortak liste dili \"sıralanabilir ↕\"; A→Z 2026-09-30, BL-475",
  },
  {
    n: 4,
    state: "chosen",
    what: "Departman grupları hep açık; katlama oku ve Collapse all yok. (Soru 3)",
    source: "2026-10-13 · Mert, Jobs thread'i: \"4-A\" (Kalksın)",
  },
  {
    n: 5,
    state: "chosen",
    what: "Archived sekmesi yalnız arşivlileri gösterir; Restore tek tık. (Soru 4'ün yarısı)",
    source: "2026-10-07 · Mert, Locations A; 2026-10-05 · Important Dates sekmeleri ve Settings Archive kararı",
  },
  {
    n: 6,
    state: "chosen",
    what: "Archived'de departmanlar ve işler iki ayrı grupta. Departman arşivlenince etkin işleri de onunla arşive gider. Arşivli kaydın çekmecesinden Delete ile tamamen silinir, arşivden de kalkar (geçmiş vardiyalar kalır). Restore: departman işsiz döner, işleri arşivde kalır; iş, departmanı etkinse ona, değilse No department altına döner. (Soru 4'ün kalanı)",
    source: "2026-10-13 · Mert, Jobs thread'i: yazılı kural + \"Birlikte arşivlensin\" + \"Kendi departmanına\"",
  },
  {
    n: 7,
    state: "chosen",
    what: "New department, Departments sekmesinde filtre satırının sağ ucunda yeşil düğme. (Soru 5'in yarısı)",
    source: "2026-10-06 · Mert, Sistem 1 (yeşil ekleme düğmesi filtre satırının sonunda)",
  },
  {
    n: 8,
    state: "chosen",
    what: "Departments sekmesi A, sade tablo: Department · Jobs · Employees. Jobs sayısına basınca Jobs sekmesi o departmanla süzülür; satıra basınca departman çekmecesi açılır. (Soru 5'in kalanı)",
    source: "2026-10-13 · Mert, Jobs thread'i: \"8-a\"; B ve C reddedildi",
  },
  {
    n: 9,
    state: "code",
    what: "İş çekmecesi: bir işin satırına basınca sağdan açılır. Sütunda yalnız sayı, \"Check to assign\" yazısı yok, çerçeveli çizgili liste, Details, Not assigned, Save, \"1 employee assigned\". Çekmece gerçek koddur.",
    source: "Kodda (main cedf5982, 2026-10-09); Mert'in 2026-10-07 V1 düzenlemeleri; 2026-10-14 Mert onayladı",
  },
  {
    n: 10,
    state: "chosen",
    what: "Telefonda yeşil ekleme düğmesi (New job / New department) arama satırında değil, sekme satırında Archived'in sağında, kısa adıyla \"+ Add\".",
    source: "2026-10-14 · Mert, Jobs thread'i (\"Karar değişikliği\")",
  },
];
