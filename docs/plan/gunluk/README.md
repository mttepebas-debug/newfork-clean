# Günlük

- `<YYYY-MM-DD>.md`: koordinatörün o günkü satırları (saat · iş · ne oldu). Yalnız eklenir.
- `<YYYY-MM-DD>/`: ajanların ham son mesajları; `SubagentStop` kancası yazar (`scripts/hooks.mjs agent-report`), dosya adı `<HHMM>-<İŞ>-<ajan>-<id>.md`.
Kayıt dosyasıdır: işçi ajan yazamaz (guard).
