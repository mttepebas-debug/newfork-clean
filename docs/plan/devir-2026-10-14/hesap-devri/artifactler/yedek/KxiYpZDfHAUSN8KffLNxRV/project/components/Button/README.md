# Button

Ekrandaki her buton: varsayılanı yeşil eylem, `secondary-button` sınıfıyla beyaz vazgeç, `danger-button` ile kırmızı yıkıcı.

- Kaynak: `packages/ui/src/components/Button.tsx`. Görünüm uygulamanın CSS'inde (`nf-button`, `styles.css:2763`).
- Kullanan verir: `children` (etiket, istenirse önünde 15–16px lucide ikon), `onClick`, `disabled`, `className`. Varsayılan `type` "button".
- Rol başına bir sınıf, ekran başına renk değiştirme yok:
  - Eylem (Save, Publish, Invite): `Button`, yeşil zemin, `theme-on-accent` metin.
  - Vazgeç (Cancel, Discard, Back): `Button className="secondary-button"`, beyaz zemin, `theme-muted` kenar, `theme-accent-deep` metin.
  - Yıkıcı (Delete, Remove, Archive): `ConfirmButton className="danger-button"`, iki tık.
- Ölçü: en az 42px yükseklik, 6px köşe, 10/16px iç boşluk, metin 750 ağırlık. Pasif hâli opacity .55.
- Odak: 2px düz `theme-focus` halka, 2px boşluk.
- Bir pencerede tek kaydetme butonu, sağ altta. Eylem butonu bir grupta en sağda durur, vazgeç onun solunda.
- Yapma: yeşil butonu dekor olarak kullanma; bir satırda iki yeşil buton koyma; `secondary-button` ile `danger-button`'ı birleştirme.
