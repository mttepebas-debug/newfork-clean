# BL-990 notları (işçi 2, worktree agent-a2539fabf0e3a2190, yerel dal task/bl-990-w2 -> origin task/bl-990)

## 0. Hazırlık
- wt-hazirla BL-990 kırmızı: task/bl-990 eski worktree'de (agent-adc5...) açık. Dal = 7ecbcc74 = origin/main, commit yok.
  Yerelde task/bl-990-w2 (aynı sha) kuruldu; push `HEAD:task/bl-990` ile.

## 1. CI trace (net-*.txt, actions.mjs, burst.mjs)
- time-off-approval:91 düşen koşu (11551756587): test 60 sn'yi şu yüzden aşıyor: her adım yavaş, en büyük boşluklar
  `docker exec psql` çağrıları (sql()/statusOf): 6,9 sn, 2 sn, 9 sn; /sign-in goto 6,6 sn.
- Kilit değil, YÜK: trace'te ~57 açık tarayıcı sayfası (test-failed-1..57.png). Spec'ler `browser.newContext()` açıp
  kapatmıyor; `browser` işçi kapsamlı -> sayfalar bütün koşu boyunca yaşıyor, hepsi aynı dünya workspace'inde.
- Her `shift-exchanges:<ws>` 'changed' yayınında bütün açık sayfalar aynı saniyede yeniden okuyor (useExchangeRealtime
  -> refreshExchangeSurfaces): 12:52:09'da 1 saniyede 175 istek / 47 sayfa (notifications 100, schedule/reference 38,
  shift-exchanges 14, employee-hub 8 ...). Ortalama API süresi dakikalara göre: 76, 75, 105, 219, 980, 2466 ms.
- Boşta (koşu başı) uç süreleri ~70-190 ms; tek başına ağır uç yok.

## 2. Ortam (CI runner)
- CI runner WSL Ubuntu-24.04 içinde (log: shell /usr/bin/bash, /home/runner). Tarayıcı, API, Vite, CI'ın Supabase'i ve
  ortak yerel Supabase aynı Linux sanal makinesinde. Bakım (2026-10-08 ~12:19Z, tren-2'den hemen önce) bu makineye
  `.wslconfig memory=10GB` + `autoMemoryReclaim=dropCache` koydu (önce varsayılan: 31,7 GB'ın yarısı ~16 GB).
- CI geçmişi: bakımdan önceki bütün koşular yeşil, sonraki bütün koşular kırmızı (37777039059'dan beri). Paket de aynı
  anda girdi -> iki aday karışık.
- Kötü koşuda 45-47. testler (düşen testten sonra Playwright işçiyi yeniden başlatır, açık sayfalar kapanır) iyi
  koşudan bile hızlı: 6,7 / 5,9 / 8,2 sn.
## 3. Yerel CI benzeri koşu (run-ci1, run-mem.mjs + pw-ci.config.mts, Playwright headless shell 1234, karantinasız)
- 47/47 yeşil, 6 dk: shift-hub-swap 11,8 sn, shift-hub-time-off 8,6 sn, time-off-approval :91 11,4 / :124 7,2 /
  :145 6,1 / :160 8,5 sn. Aynı kod, bol bellekli Windows'ta yavaşlamıyor.
- Tarayıcı belleği (tasklist working set toplamı, başlangıç 8 süreç 619 MB = Mert'in Chrome'u): test ilerledikçe
  doğrusal büyüyor; 03:35:00 46 süreç 9,7 GB, 03:37:10 75 süreç 17,6 GB. Koşu bitince 510 MB'a iniyor.
- Sonuç: kök = sızan tarayıcı bağlamları (e2e kodu) + CI sanal makinesinin belleğinin 16 -> 10 GB'a inmesi (ortam).
- Düzeltme: e2e/fixtures/test.ts (testin açtığı bağlamları test bitince kapatır) + bütün spec'ler test'i oradan alır;
  kırmızı test e2e/flows/browser-contexts-close.spec.ts.

- YEREL DB AYARI: 03:29Z `alter system set track_functions='pl'` (supabase_admin). GERİ AL:
  `alter system reset track_functions; select pg_reload_conf();`
