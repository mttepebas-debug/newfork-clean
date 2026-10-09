# EMP-001 / BL-444: erişimi alınmış üye acil durum kişisinde "Try again" görmez (nf-backend, 2026-09-30)

## 1. Nerede duruyor
Bitti, main'e alınmayı bekliyor. Dal `task/emp-001-contact-refusal`, tek commit `2989747d`, taban `origin/main` @ `a98b0671`. Push yok. Worktree `…\.claude\worktrees\optimistic-blackburn-f4a88f`. Delegasyon R1: inceleme koordinatörün diff okuması.

## 2. Ne yapıldı (etkisi)
**Account → Profile → "Emergency contact"**: formu açıkken erişimi alınan kişi "Save"e basınca artık denenecek bir şey varmış gibi "Try again." okumaz; erişiminin bittiğini söyleyen cümleyi görür.

Örnek: Deniz'in profil formu açık. Owner, Employees → Deniz → Access → "Remove access" yapar. Deniz acil durum kişisini değiştirip "Save"e basar.
- Önce: "Your emergency contact could not be saved in <workspace>. Try again."
- Şimdi: "Your emergency contact can no longer be changed in <workspace>: your access there has ended or the workspace is closed."

Nasıl: sunucunun cevabı bu durumda 404, neden `authz.not_member` (API sözleşmesi, değişmedi). Sayfa yalnız `authz.not_active` ve `authz.workspace_closed`'ı "kalıcı ret" sayıyordu. Üç neden artık tek yardımcıda: `accessEnded` (`apps/web/src/account/ProfilePage.tsx:92`); `saveContact` onu çağırıyor (`:348`).

İkiz liste taraması: bu sayfada nedenleri elle sayan başka kayıt yolu yok. Tercih edilen ad yolu (`savePreferredName`, `:321`) hiçbir nedene bakmıyor, her rette "Try again." diyor. `employee-data.ts:502-503`'teki yorum aynı iki nedeni sayıyordu; liste yerine yardımcıya işaret ediyor (yalnız yorum).

## 3. Açık kalanlar
- Bu ekranda gerçek veriyle yeniden deneme (QA'nın kurduğu senaryo) yapılmadı; vitest hücresi gerçek cevabın biçimiyle (404, `authz.not_member`) kuruldu. Görsel QA borcuyla aynı turda bakılabilir.

## 4. Ekranda ne değişti
Account → Profile: yukarıdaki durumda hata satırının metni. Yeni kullanıcı metni yok; var olan cümle (aynen): "Your emergency contact can no longer be changed in <workspace>: your access there has ended or the workspace is closed." Başka hiçbir şey değişmedi.

## 5. Sırada ne var
- **Yolda bulunan (dokunulmadı), (leave: low / do: safe):** aynı durumda **tercih edilen ad** hâlâ "Your preferred name could not be sent to <workspace>. Try again." der (Account → Profile → "Preferred name"; `ProfilePage.tsx:321` her reddi aynı sayıyor). Çare: aynı `accessEnded` yardımcısı + "can no longer be changed" cümlesinin tercih edilen ad için karşılığı. Yeni kullanıcı metni gerektirdiği için bu işe katılmadı.
- EMP-001 C2: `nf-db`'nin C1 sözleşmesi gelince.

## Kanıt
Ölçüm: 2026-09-30, CI boştayken (`gh run list`: main, batch-t9, batch-t8 tamamlanmış), `24357e54`'te; ardından main'e yalnız `docs/plan/HANDOFF.md` girdi, dal onun üstüne alındı (`2989747d`, kod farkı yok).

| Adım | Komut | Sonuç |
|---|---|---|
| Kırmızı | `vitest run src/account/ProfilePage.test.tsx`, düzeltmeden önce | 1 düştü ("…where the answer is authz.not_member": "could not be saved … Try again." geldi), 21 geçti |
| Yeşil | aynı | 22/22 |
| typecheck | `pnpm.cmd --filter @newfork/web typecheck` | hata yok |
| lint | `pnpm.cmd lint` | 5/5 görev, 0 hata (20 eski uyarı) |
| web vitest, tamamı | `pnpm.cmd --filter @newfork/web exec vitest run` | 221 dosya; 1966 geçti, 1 atlandı, 0 düştü |

Hücre: `apps/web/src/account/ProfilePage.test.tsx:505` (`it.each`, üç neden; `authz.not_member` 404 ile, `:508`).
Dokunulan: `ProfilePage.tsx`, `ProfilePage.test.tsx`, `employee-data.ts` (yorum). API, `supabase/**`, çekmece, e2e dokunulmadı.
Skills: TDD yöntemi uygulandı (önce kırmızı koşu); skill metinleri yüklenmedi (tasarruf notu).
Temizlik: main'e girdiği doğrulanan yerel `task/emp-001-b4` dalı silindi (beş dosyada `origin/main` ile fark 0 satır).
