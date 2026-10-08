# v78 — boyut değişimi sonrası ayrı çizim adayı

## Kapsam

8 Ekim 2026, kullanıcının “devam” onayı: önceki aynı-scratch deneyinden sonra
küçük bir aday yalnız ayrı test paketinde sınanacak. CLAIM #102363.
Başlangıç commit'i `4780072369530b37af68dd392b21bd1d8238adf2`.

Üretim uygulaması, özgün test ve kalite eşikleri değişmez. Test betiği ve CI
bağlantısı commit/push edilebilir; merge/deploy veya gerçek notlara erişim yoktur.
Bu adayın başarılı olacağı veya iPad sorununu düzelteceği varsayılmıyor.

## Dayanak ve sınırı

Önceki CI `37833218622`, aynı scratch'e okumalar sonrasında aynı 200 çağrı
tekrarlandığında yalnız dört örnek pikselin referansla eşleştiğini gösterdi.
Yeni canvas nesnesi gerekli değildi. Bu, bir kare beklemenin çözüm olduğunu
veya farkın motor nedenini kanıtlamadı. Özgün kabul testi hâlâ 53/54 idi.
Kaynak/ham kanıt ve ayrıntılı sınırlar: merkezi not #102362 ve
`outputs/ink-stage-diagnostic/RESULT-37833218622.md`.

## Tek aday

`work/diagnose-ink-resize.cjs`, hash'i sabit paketten git dışında bir kopya
üretir. Yalnız bu kopyanın `pdf-workspace.js` dosyasına hedefli yama uygulanır:

- İlk gözlenen boyut benimsenir; ilk açılış kendi başına ertelenmez.
- Gerçek `canvas.width/height` değiştiğinde geçiş boyunca görünür satırlar
  mevcut doğrudan çizim yoluyla çizilir. O aralıkta yeni karo oluşturulmaz.
- Tek bekleyen animasyon karesi sonrasında doğrudan çizim kilidi çözülür.
  Güncel hesap/defter/sayfa/tuval koşulları uygunsa bir kez güncel görünüm çizilir.
- Reset, sayfadan ayrılma, art arda boyut değişimi ve araya giren kalem/gezinti
  işlemleri eski geri çağrının sonradan yanlış görünümü çizmesini önlemelidir.
- Piksel okuması, CPU/GPU ipucu veya korunmuş scratch eklenmez. Eski geometrinin
  medya paneli kapanışında çizilme sırası bu adayda ayrıca değiştirilmez.

Geçiş çizimi ek iş yapar; sürekli sıcak çizim maliyeti artmamalıdır. Bu bir
performans sonucu değil, ölçülmesi gereken aday maliyetidir.

## Denetim

Betik sabit kaynak, manifest ve özgün runner hash'ini ve 246 varlığı doğrular.
Kopyada manifest kasıtlı olarak eski tutulur; paket yayımlanamaz ve bütün
raporlarda `diagnosticOnly=true`, `releaseEligible=false` bulunur.

Özgün `work/verify-slide-flow.cjs`, `BILGE_TEST_ROOT` ile doğrudan bu kopyaya
karşı çalışır. Test kopyası veya değiştirilmiş kalite oracle'ı kullanılmaz.
Planlanan sonraki kapı Linux CI'da DPR2 Chromium + WebKit'in 54 senaryosudur; kaynak kayması,
gerçekte sunulan dosya hash'i ve vaka sayısı ayrı doğrulanır. Normal zorunlu
paketin testi de yerinde kalır. Adayın sonucu onun başarısızlığını maskelemez.

Zamanlayıcı kontrolü için gerçek aday fonksiyonuyla saf pozitif/negatif
kontroller ayrıca çalıştırılır. Bunlar sahte RAF ile yürütme sırasını ölçer,
gerçek tarayıcı çizim kalitesini veya cihaz performansını değil.

Ölçüm sonuçları yeni `outputs/ink-resize-candidate/` dizinlerine yazılır;
eski kanıtlar üzerine yazılmaz. Yerel Windows sonucu Linux'un yerine geçmez.
Yerel ön eleme aşağıda kaydedildi; aday reddedildiğinden Linux aşamasına geçilmedi.

## Sonuç: yerel ön elemede reddedildi

`node work/diagnose-ink-resize.cjs --self-test`: **10/10** saf kontrol geçti.
Ardından değişmemiş özgün runner'ın `physical bitmap resize rebuilds ink before
warm reuse` senaryosu, DPR2'de Chromium ve WebKit'te iki paket için çalıştırıldı:

| Paket | Sonuç | İkinci çizimde çizgi işleme |
| --- | --- | --- |
| Değişmemiş başlangıç | 2/2 geçti | 0 |
| Bir RAF ertelemeli aday | 0/2 geçti | 6 |

Genişlik, yükseklik ve eski boyuta dönüşün üçünde de aynı sonuç ölçüldü.
Çizim verisi değişmedi; bu basit senaryoda alfa/beyaz zemin farkı 0'dı.
Aday sonraki RAF'a kadar karoları boş tutup aynı iş içindeki ikinci çizimde
bütün görünür çizgileri yeniden işledi. Hata özgün `warmCalls === 0`
korumasında, iki motorda da `6 !== 0` oldu. Bu bir ölçülmüş çizgi-tekrarı
gerilemesidir; fiziksel cihazda milisaniye veya takılma ölçümü değildir.

**Karar:** Aday uygulamaya alınmadı. Test veya performans eşiği gevşetilmedi.
Ön elemede reddedilen adayı uzun CI'a göndermek yerine hazırlanan CI bağlantısı
geri çıkarıldı; workflow özgün haliyle kaldı. Linux özgün `media undo` hatasına
etkisi, tam 54 senaryo ve yeni callback'in gerçek hesap/kalem yaşam döngüsü
entegrasyonu bu aday için **ölçülmedi**. Önceki Linux 53/54 durumu değişmedi.
Bu adayın başarısızlığı, bütün erteleme stratejilerinin olanaksız olduğunu
kanıtlamaz; yalnız burada sınanan uygulama mevcut kabul sözleşmesini bozuyor.

Kanıt: `outputs/ink-resize-candidate/20261008195342557/results.json`.
Ham özgün test raporları: `outputs/slide-flow/dpr-2-resize-20261008195342557-*`.
Sonuç hash'i: `2c7b51814ed126735232e98796475e9ed79b6f5273f813f07bb51d1737a3c7b9`.
Aday `pdf-workspace.js`: `202417e7e3b5a3d56ed186226648777c89b511367e204eb36eb4063895de68c2`.
Yalnız yeni tanı betiği ve bu belge tutulur; uygulama, paket, özgün runner,
manifest, canlı yayın ve notlar değişmedi.

## Sabit kaynaklar

| Dosya | SHA256 |
| --- | --- |
| `pdf-workspace.js` | `3b3fcdedfd40ba4656b7c8dca2ece1eeb605f54229326b3d91b03351cb11007e` |
| `SHA256SUMS` | `6f172d47680d93b9d39e316a1f1512ee0e0c2e4645b95af9aab33890b34890f9` |
| `verify-slide-flow.cjs` | `f2cb459827c1d725d6df1f22c6ff12047a02d415a7d26b8eb65f3eaa769de8d0` |
