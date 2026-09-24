# Bilge Defter — el yazısı pilotu kabul testleri

Tarih: 23 Eylül 2026. Bu dosya test tasarımıdır; aşağıdaki kontroller bu turda çalıştırılmış veya geçmiş sayılmaz. Önceki incelemedeki hata üretimleri geçmiş kanıttır, düzeltme kanıtı değildir.

## Önce veri güvenliği

| Kimlik | Senaryo | Beklenen sonuç |
|---|---|---|
| G01 | Çevrim dışı düzenle, kapat/aç, başka cihazın yeni kopyasını getir | Yerel değişiklik unutulmaz; iki kopya korunur, sessiz değiştirme yok |
| G02 | Şifreleme veya gönderim sürerken yeni yazı ekle | Yalnız gönderilen revizyon onaylanır; yeni yazı bekleyen kalır |
| G03 | İki eşitleme tetikleyicisi ve iki cihaz aynı anda yazar | Tek yerel işlem; sunucu sürüm koşulu çakışmayı yakalar |
| G04 | PDF 3x zoom, yatay kaydırma, V2 sığdır, kaydet/aç | Koordinatlar geçerli; not açılır; yedek dışa aktarılabilir |
| G05 | Bozuk veri kaydetme girişimi ve depolama dolu hatası | Son sağlam kayıt korunur; kurtarma mümkün; yanlış kaydedildi mesajı yok |
| G06 | V2 metin, kamera, görsel, PDF aç/indir, düzenle, sayfa seç | Her komut gerçek işlem yapar; sayfa seçmek işlem menüsü açmaz |
| G07 | Gerçek yükleme öncesi kurtarma kopyası mevcut | V2 kurtarmayı doğru depolamadan algılar ve güvenli geri getirir |

## Tanıma girdisi ve sonuç güvenliği

| Kimlik | Senaryo | Beklenen sonuç |
|---|---|---|
| I01 | Boş, yalnız silgi veya yalnız görsel seçimi | Çizgi tanımaya istek yok; uygun açıklama |
| I02 | Yaz, tamamen sil, tanıma önizlemesini aç | Silinen yazı ne görüntüde ne çizgi isteğinde görünür |
| I03 | Kısmen sil, silinen yerin üstüne yeniden yaz | İşlem sırası doğru; yeni yazı korunur, eski silinmiş bölüm geri gelmez |
| I04 | 2000 px üzeri geniş/uzun yazı; kalın çizgi sınıra değiyor | Sessiz kırpma yok; gerekirse numaralı bölümler ve doğru birleşme |
| I05 | PDF zoom/pan, normal sayfa sığdırma, ekran yönü değişimi | Aynı seçili içerik aynı belge koordinatlarıyla gider |
| I06 | Eski x/y/p yedeği, zaman bilgisi yok | Zaman uydurulmaz; desteklenen istekte alan atlanır veya açık fallback açıklaması |
| I07 | Yeni çizgi, noktalı harfler ve sayfa yeniden açılışı | Sıra/zaman tutarlı; ı/i ve sonradan konan noktalar kaybolmaz |
| I08 | Çift tıklama, gecikmiş yanıt, kapat/aç ve sayfa değiştirme | En fazla bir geçerli sonuç; eski yanıt yanlış sayfaya eklenmez |
| I09 | Tanırken seçimi düzenle veya sil | Sonuç eski içeriğe bağlı olduğu için otomatik uygulanmaz |
| I10 | Sonucu düzelt, ilk yerleşimde boyut/döndür, Bitti, Geri al | Asıl mürekkep korunur; ekleme tek geri alma adımıdır |
| I11 | Sonuçta HTML/script benzeri metin | Düz metin olarak gösterilir; çalıştırılmaz |
| I12 | 401, HTML giriş sayfası, 429, 5xx, çevrim dışı, zaman aşımı | Notlar değişmez; dürüst hata; izinsiz fallback veya ücretli sonsuz deneme yok |
| I13 | Paragraf seç ve gönderim önizlemesini incele | Başka sayfa, çöp kutusu, kişisel metadata veya tüm defter gönderilmez |
| I14 | Anahtar yok, sağlayıcı kapalı, kota bitti | Tanıma kapalı; çizim/kayıt/yerel yedek çalışır |
| I15 | PWA çevrim dışı; eski uygulama/yedekten yeni sürüme geçiş | Veri korunur; bulut tanıması çevrim dışı çalışıyormuş gibi gösterilmez |
| I16 | Sekme çakışması, uygulama kapanması ve kota hatası sırasında sonuç ekleme | Kayıt onayı olmadan başarı gösterilmez; orijinal mürekkep korunur |

## Gerçek örnek tablosu

Henüz doldurulmadı; motorların doğruluk sıralaması bilinmiyor.

Her örnek için: anonim örnek kimliği, izin durumu, yazar/cihaz grubu, kaynak türü, referans metin, görünür çizgi/görüntü eşleşmesi, sağlayıcı ve API/model sürümü, tahmin, karakter/kelime hata sayısı, kritik terim/rakam hatası, düzeltme saniyesi, yeniden yazma saniyesi, yanıt süresi, maliyet, hata nedeni.

- Kapsam: Türkçe ı/İ/i/ş/ğ/ç/ö/ü, hızlı/bitişik yazı, rakam/noktalama, ders terimleri, çok satır, silgi sonrası yazı.
- Hassas sağlık bilgisi ve gerçek kişi bilgisi kullanılmaz; eğitim amaçlı örnekler tercih edilir.
- Aynı yazarın benzer notlarının tamamı hem ayarlama hem kabul kümesinde kullanılmaz; sonuçlar yazar/cihaz bazında da raporlanır.
- Üçüncü taraf hizmete gönderim ve maliyet yetkisi yoksa gerçek motor testleri not tested kalır.
- Yayın kabulü: G ve I gruplarının tamamı geçer; ilgili fiziksel cihaz kontrolleri, bütçe ve kalite eşikleri kullanıcıyla netleştirilir; ardından ayrı yayın onayı alınır.
