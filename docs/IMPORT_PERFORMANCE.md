# v80 içe aktarma ölçümü ve doğrulama sınırları

11 Ekim 2026. Yerel çalışma; canlı yayın veya fiziksel iPad kabulü değildir.
Ham sonuçlar: `outputs/import-profile-20261011/`; tamamlanmış son kanıt
`PROOF.json` ve `REPORT.md` içinde tutulur. Buradaki komutlar tek başına
testlerin geçtiği anlamına gelmez.

## Ölçülen yol

`work/profile-pptx-import.cjs` gerçek dosya seçici, ağsız PPTX çizicisi,
geçici hazırlama deposu, **Deftere ekle**, kalıcı kayıt ve yeniden açılma
yolunu çalıştırır. Sunucu, dosyaları değiştirmeden loopback üzerinden sunar.
Hesap sentetiktir; öğrenci belgesi veya canlı servis kullanılmaz.

Sabit 20 slayt, altı tekrarlı gürültülü görsel içerir. Çıktı yaklaşık
11,8 milyon encoded karakterdir; kaynak dosya 20 MiB, raster toplamı 24 MiB
sınırları içindedir. Küçük defter 1 sayfa, dolu defter 24 sayfa/12 farklı
görseldir. Chromium ve WebKit, kayıt işçisi açık ve native fallback olmak
üzere sekiz ayrı hücrede çalışır. Her hücre yeni tarayıcı ve depolama kullanır.

Süreler iç içedir: defter doğrulama, PDF doğrulama ve dbPut süreleri
toplanamaz. Main-thread heartbeat, gerçek kalem gecikmesi değildir. Apply
bitişi diyalog kapanışı/kayıt sonucu ve iki animasyon karesinden sonraki
20 ms kuyruğudur; bütün görünür sayfaların çiziminin bittiği iddiası değildir.
Mantıksal görsel/JSON uzunlukları gerçek heap, RSS, GPU veya disk tüketimi değildir.

## Sınırlı değişiklik

Bir `validState` çağrısı boyunca aynı PDF görselinin başlığı/base64 gövdesi
yeniden taranmaz. En fazla 128 görsel için **yalnız boyut sonucu** tutulur;
limitten sonraki görseller normal denetlenir. Bu boyut tablosu fonksiyon
dönüşünde bırakılır; global veya kalıcı olarak saklanmaz. Mevcut görsel ve
doğrulama sonucu önbellekleri bundan ayrıdır. Her sayfanın width,
height, name, number, total, görünüm ve defter bilgileri ayrı doğrulanır.

Ek güvenlik düzeltmesi: kalıcı PDF doğrulama verdict önbelleğinin
`join('|')` anahtarı kaldırılmıştır. Örneğin sayı `1000` ile metin `"1000"`
artık aynı kabul sonucunu paylaşmaz; tüm alanlar strict eşitlikle karşılaştırılır.
`validStateCached` yerel boyut tablosunu da gerçek doğrulayıcıya iletir.

Kalite, çözünürlük, görüntü formatı, codec, dosya/sayfa sınırı, depolama
şeması, mürekkep geometrisi veya PNG/JPEG seçimi değişmez. Görsel decode
yoluna bu adımda performans müdahalesi yapılmaz.

## İlk sekiz hücrelik karşılaştırma

| Dolu defter, kayıt yolu | Önce Apply / doğrulama | Sonra Apply / doğrulama |
| --- | ---: | ---: |
| Chromium işçi | 958 / 630 ms | 761 / 370 ms |
| Chromium fallback | 973 / 620 ms | 829 / 369 ms |
| WebKit işçi | 1240 / 82 ms | 1954 / 82 ms |
| WebKit fallback | 2111 / 75 ms | 2281 / 68 ms |

Bu tek koşulu keşif ölçümünde **genel hızlanma kanıtlanmadı**. Değiştirilmeyen
hazırlama aşaması da ikinci koşuda daha yavaştı (Chromium yaklaşık 5,3→6,2–7,4 sn;
WebKit 21,5–22,3→26,9–27,4 sn). Ortam/sıralama etkisi ayrıştırılmadığı için
bu sürelerden cihaz garantisi veya tüm tarayıcılara yayılan yüzde çıkarılmaz.
Kanıtlanan kazanç tekrarlanan kontrol işinin azalmasıdır: aynı görselli 1.000
sayfada bir `validState` çağrısı artık 1.000 yerine bir başlık taraması yapar.
Kayıt, önceki sayfalar ve yeniden açılan içerik iki paket için de denetlenir.

## Güvenlik ve yayın kapıları

`work/verify-pdf-validation.cjs`: her motorda 10 davranış vakası; 1.000 sayfa
canlı/çöp, 128 sınırı, çağrılar arası mutasyon, bozuk kuyruk, metadata, PNG/JPEG
ve padding'siz eski kayıtlar. Eski dondurulmuş kaynakta sekiz tip vakası ve
iki tekrar-tarama vakası davranış nedeniyle başarısız olur; eksik API değildir.

Yeni yedi güvenlik süiti CI'da ayrı zorunlu iştir. Tarihsel 26 süit, gerçek v79
okuyucu uyumu, çevrimdışı güncelleme, DPR1/DPR2, sayfa paneli, zoom ve web-only
yayın/rollback testleri ayrıca korunur. Async okuyucu için çizim testi yalnız
istenen görünür görsellerin hazır/başarısız olmasını bekler; piksel toleransları
ve 54 vaka değişmez. Eski/yeni koşucu hash'leri ve yalnız bu `paint` farkı
eşli test sözleşmesinde zorunlu kaydedilir.

Commit/CI, özel stage ve geri dönüş kanıtı tamamlanmadan canlı aktivasyon
yapılmaz. Gerçek iPad'de büyük sunum, arka plana alıp dönme, kalem/avuç,
yeniden açma ve JSON yedek kabulü kullanıcıyla ayrıca yapılır. Tam referanslı
ihtiyaç-anı okuma ve sınır artırımı bu paketin kapsamı değildir.
