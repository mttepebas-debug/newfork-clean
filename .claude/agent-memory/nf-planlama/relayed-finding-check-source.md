---
name: relayed-finding-check-source
description: Koordinatörün aktardığı inceleme bulgusu (Q1, D3 gibi) kaynak rapordakinden farklı çıkabilir; backlog'a yazmadan önce raporu oku
metadata:
  type: feedback
---

Koordinatörün görev mesajında özetlediği bulgu, kaynak rapordaki bulguyla aynı olmayabilir. Maddeyi yazmadan önce
`artifacts/<rol>/<iş>/RAPOR.md`'deki asıl metni oku ve kodda ölç.

**Why:** 2026-09-30 (`task/backlog-program-31`): görev "Q1 = hesabı bağlı kişiye davet kuralı sunucuda yok" diyordu;
`nf-guvenlik` raporunun Q1'i yönetilen lokasyon komutuydu, davet komutu ise zaten P0002 ile reddediyordu. Özete göre
yazılsaydı yanlış madde açılırdı. Aynı turda BL-406 da bu düzeltmeyle kapanmıştı, görevde yazmıyordu.

**How to apply:** her "şu bulguyu backlog'a yaz" görevinde raporu aç, iddiayı kodda doğrula, farkı maddeye ve
koordinatöre yaz; düzeltmenin kapattığı başka açık madde var mı diye BACKLOG'da ara.
