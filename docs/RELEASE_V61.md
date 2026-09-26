# v61 — kayıtta yalnız değişen sayfa metne çevrilir

Kullanıcı 26 Eylül 2026'da "tüm defter yerine yalnız değişen sayfa" üzerinden kayıt için
çalışmayı istedi (claim 101529).

## Karar: depolama biçimi değişmez

IndexedDB'de defteri sayfa sayfa ayrı kayıtlara bölmek veri göçü gerektirir ve v60'a
geri dönüşü veri açısından tehlikeli yapardı (eski sürüm yeni biçimi okuyamaz). Bunun
yerine kayıt metni sayfa parçalarından kurulur: değişmeyen sayfaların daha önce üretilmiş
`JSON`'u yeniden kullanılır, yalnız değişen sayfa yeniden metne çevrilir. Diske yazılan
kayıt `JSON.stringify(defter)` ile bayt bayt aynıdır; v60/v59'a geri dönüş güvenlidir.

## Değişiklikler (`index.html`, `sync-workspace.js`)

- Sayfa önbelleği bir imzayla geçersiz olur: `markChanged` ile artan sayfa sayacı, çizgi
  sayısı, son çizginin nokta sayısı, sayfanın diğer alanları ve PDF nesnesinin kimliği ile
  görüntü uzunluğu. Başka bir sayfanın adı, rengi, PDF'i veya çizgi sayısı değişince de
  yakalanır.
- Önbellekli kayıtta sayfa ve PDF doğrulama sonuçları aynı imzayla hatırlanır; PDF
  görüntüsünü her kayıtta baştan tarayan düzenli ifade tekrarlanmaz. Tam kayıtta
  doğrulama eskisi gibi baştan sona çalışır.
- Güvenlik ağı: imzanın göremeyeceği yerinde bir değişiklik (ör. başka sayfadaki bir
  çizginin rengi) sayfadan çıkarken ve kullanıcı dururken önbellek tam metinle
  karşılaştırılarak bulunur ve bütün defter yazılır. Kaçırmalar sayılır ve konsola yazılır.
- Eşitleme: 5 saniyelik denetim ve gönderim de aynı birleştirmeyi kullanır; metin
  `JSON.stringify` ile aynıdır.

Kütüphane, hesap servisi, veritabanları, nginx izin listesi, Access/DNS değişmez.

## Yerel doğrulama

- `npm test`: 13 suite geçti; v51, v52, v56, v57, v58, v59 ve v60 temel paketleri Git'ten
  sabit hash'lerle yeniden üretildi.
- `verify-v61-save.cjs`, Chromium ve WebKit, **10 kontrol**: 8 tür düzenlemenin
  (kalem, başka sayfanın adı ve kâğıt rengi, PDF değişimi, başka sayfadan çizgi silme,
  sayfa sırası, çöpteki sayfa, etkin sayfa değişimi) her birinden sonra disk
  `JSON.stringify(defter)` ile aynı; eşitleme metni de aynı; imzanın kaçırdığı değişiklik
  çıkışta ve boşta denetimde yazılıyor.
- Sentetik defterde bir sayfa düzenlemesinin kaydı sayfayı en uzun ne kadar kilitliyor
  (tam kayıt → sayfa bazlı kayıt; iki koşu):

| Motor | 36 MB mürekkep | 36 MB PDF |
|---|---|---|
| Chromium | 100 → 31 ms | 212 → 19 ms; 221 → 26 ms |
| WebKit | 114 → 47 ms; 127 → 62 ms | 63 → 41 ms; 64 → 47 ms |

  v59'da aynı mürekkep defteri 218–293 ms kilitliyordu. Kalan süre artık metne çevirme
  değil, birleştirilmiş metnin belleğe kopyalanması ve worker'a aktarılmasıdır.
- Fiziksel iPad ve gerçek hesap testi yapılmadı.

## Yayın

Henüz yapılmadı. Sıra: `build-release-v61.py` → klipper'da `deploy-v61.py prepare`,
`stage` (yalnız `127.0.0.1:18800`), kullanıcı onayı, `activate`.

Geri dönüş (yalnız v61 etkin sürümken):

```sh
sudo python3 /opt/bilge-defter-classroom-v61/deploy-v61.py rollback
```
