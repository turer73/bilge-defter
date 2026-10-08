# v78: sınırlı, denetim-sonrası çizim tanısı

## Yetki ve değişmeyenler

8 Ekim 2026: Kullanıcı ayrı tanı betiği, test amaçlı commit/push ve Linux CI
koşusunu onayladı. Uygulama düzeltmesi, birleştirme veya canlı yayın bu kapsamda
değildir. Önceki bağımsız incelemeler: Opus #102335, Antigravity #102340,
Fable #102344; kapsamı daraltan sentez #102345. CLAIM: #102347.

Sabit başlangıç: `4dbbc8fbae01143ea499df47d851501674dd1593`.

| Sabit dosya | SHA256 |
| --- | --- |
| `work/bilge-defter-invited-v78/pdf-workspace.js` | `3b3fcdedfd40ba4656b7c8dca2ece1eeb605f54229326b3d91b03351cb11007e` |
| `work/bilge-defter-invited-v78/SHA256SUMS` | `6f172d47680d93b9d39e316a1f1512ee0e0c2e4645b95af9aab33890b34890f9` |
| `work/verify-slide-flow.cjs` | `f2cb459827c1d725d6df1f22c6ff12047a02d415a7d26b8eb65f3eaa769de8d0` |

Özgün test ve eşikleri değişmez. Son bilinen zorunlu Linux CI sonucu 53/54'tür
(`37745804094`); bu belge veya tanı adımının tamamlanması onu başarılı yapmaz.

## Ölçüm sözleşmesi

`node work/diagnose-ink-stages.cjs` ayrı, git dışında bir paket ve çalıştırıcı
kopyası üretir. Gerçek sürüm dosyaları ve kanonik çalıştırıcı değiştirilmez.
Kopyanın manifesti kasıtlı olarak değiştirilmez; bu paket **yayımlanamaz**.

- Mevcut lifetime deneyindeki gibi scratch yüzeylerinin son boyut küçültmesi
  yalnız kopyada engellenir. Biriken scratch üst sınırı 100 milyon pikseldir
  (ham RGBA için 400 MB; tarayıcının diğer belleği buna dahil değildir).
- Sıcak yol yalnız nesne kimliği, faz, boyut ve kopya dikdörtgeni metaverisi
  tutar. Ek çizim, piksel okuma, bekleme veya test tuvali oluşturulmaz.
- Özgün `media undo` denetiminin sonuçları ve PNG'leri önce korunur. Ardından,
  soğuk yeniden çizim eski karoları küçültmeden önce, kalan yüzeyler okunur.
- Başlangıç noktaları yalnız son görünür sayfadaki dört pikseldir:
  `(939,1066)`, `(942,1071)`, `(945,1076)`, `(948,1081)`.
  Karo koordinatları gerçek kopya dikdörtgenlerinden türetilir; yüzey
  numaraları sabitlenmez. Özgün denetimin zaten okuduğu actual/reference
  dizilerindeki değerler kullanılır, yeni referans çizilmez.
- Aynı scratch her sayfada temizlendiğinden ilk sayfanın beş eski hata
  noktasının scratch karşılığı **elde yoktur**. Sıfır piksel kayıp mürekkep
  kanıtı sayılamaz.
- Kimlik, yazım nesli, son sayfa veya geometri uyuşmazsa; beklenen sapma
  yeniden oluşmazsa ya da dosyalar değişirse sonuç **sonuçsuz/geçersiz** olur.
  Başarı veya düzeltme olarak raporlanmaz.

Scratch–referans, karo–scratch ve ana tuval–karo karşılaştırmaları ayrı tutulur.
Okuma anındaki yüzey farkı, geçmiş GPU kopyalama anının veya motor mekanizmasının
kesin kanıtı değildir. Scratch tutma ve metaveri kaydı da deney müdahaleleridir.
Yeni aynı-scratch çizimi, WebGL sorgusu veya bir kare erteleme bu deneye dahil
değildir. Linux sonucu fiziksel iPad/Safari kabulü yerine geçmez.

## CI ve sonuçlar

Tanı, zorunlu DPR2 adımı başarısız olduktan sonra ayrı adım olarak çalışır;
zorunlu başarısızlığı maskelemez. Çıktılar `outputs/ink-stage-diagnostic/`
altında, özgün denetim çıktıları ise ayrı etiketli `outputs/slide-flow/`
dizinindedir. `releaseEligible` her durumda `false` kalır.

## Yerel çalıştırıcı kontrolü

- `node work/diagnose-ink-stages.cjs --self-test`: 10/10. Sabit hash,
  tek değiştirme noktası, tamsayı 1:1 kopya, sınır ve kimlik/yazım nesli
  korumaları; küçük renk farklarının hata sayılmaması denetlendi.
- Windows WebKit, `20261008185934205`: özgün hedef senaryo 1/1 geçti;
  dosya kayması yok. Dört noktanın nesne/kopya zinciri doğrulandı, fakat
  hata tekrarlanmadığı için tanı `inconclusive` döndü ve ek piksel okumadı.
- Bu, Linux hatasının düzeldiğini göstermez. Linux CI sonucu bu belgenin
  commit edildiği anda henüz yoktur; CI artifact'i ayrıca incelenmelidir.
