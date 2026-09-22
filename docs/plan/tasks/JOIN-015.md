# JOIN-015 Workspace yaşam döngüsü: kapatma, planlı kapatma, devir
Status: draft
Session: -   Branch: task/join-015   Worktree: yok   DB: KİLİT (muhtemel)

Plan ID'leri: M2, E7, S12, S13 + kullanıcı kapsamı 2026-09-21

Goal: Kapatma, planlı kapatma ve sahiplik devri uçtan uca kullanışlı olsun ve ekranlar geliştirici diliyle konuşmayı bıraksın.

## Kullanıcı şikâyetleri (2026-09-21)
1. Bu düğmelerin açtığı pencereler ve **şifre girme ekranı** geliştirici mesajları gibi okunuyor.
2. Devri bloklayan mesajlar **tek tek sayıyor**: "bu employee bu workspace'e bağlı, bu employee bu workspace'e bağlı…". Kuralı bir kez söyleyen **toplu bir mesaj** olmalı.
3. Akışın tamamı elden geçirilip mimariye uygun hâle gelmeli.

In scope:
- Engelleme mesajları tek kural cümlesine iner (ör. "Bu workspace'te hâlâ 12 çalışan var. Anında kapatmak için önce hepsinin erişimini kaldır.") — satır satır liste yerine sayı ve tek eylem.
- `WorkspacesPage` (937 satır) içindeki kapatma ve devir akışları okunabilir parçalara ayrılır; onay pencereleri kit diline (`PreBizFrame`/`ConfirmButton`) iner.
- **Şifre ekranı kararı kullanıcıya sorulacak:** reauth kapısı yıkıcı işlem öncesi kimlik doğrulaması. Kaldırılırsa çalınmış bir oturum workspace'i kapatabilir. Seçenekler: (a) kalsın ama metni insanlaşsın, (b) yalnız anında kapatmada kalsın, planlıda ve devirde kalksın, (c) tamamen kalksın. **Karar alınmadan dokunulmaz.**
- Ham sunucu mesajı gösteren yerler temizlenir.

Out of scope: kapanma sonrası veri saklama/purge işi (OPS), faturalama.
Done when: her engel tek cümle; hiçbir pencerede ham sunucu mesajı yok; S12 ve S13 elle turu geçmiş ve testli.
Touches: `apps/web/src/account/WorkspacesPage.tsx`, `request_workspace_closure_service`, `initiate_workspace_ownership_transfer_service`, reauth yüzeyi.
Risk: yıkıcı işlemler. Her değişiklik testle sabitlenir; güvenlik kapısı kullanıcı kararı olmadan gevşetilmez.

## Notes / Result
