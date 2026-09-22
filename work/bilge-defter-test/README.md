# Bilge Defter tablet test paketi

Bu paket yalnızca ilk test kapsamını içerir:

- Kalem/fare çizimi, fosforlu kalem, silgi ve geri alma
- Kalemi `touch` olarak bildiren tabletler için varsayılan uyumluluk modu
- Doğru `pen` bilgisi veren cihazlarda açılabilen avuç içi koruması
- IndexedDB ile cihaz içi yerel kayıt
- JSON yedek dışa aktarma ve geri yükleme
- PWA önbelleğiyle yeniden açma/çevrim dışı kullanım hazırlığı

AI, sözlük, hesap, sunucu eşitlemesi ve Bilge Arena entegrasyonu yoktur.

## v20: özel HTTPS ve yüklenebilir PWA

- Özel adres: https://klipper-2.tail1ade8e.ts.net:8443/ . İlk açılış ve güncelleme için Tailscale gerekir. HTTP test adresi korunur; Funnel / genel internet yayını yoktur.
- Araçlar → Kurulum ve çevrim dışı ekranı kurulum yönergelerini, paket durumunu ve güncelleme denetimini gösterir. iPad'de Safari → Paylaş → Ana Ekrana Ekle; desteklenen diğer tarayıcılarda yükleme menüsü kullanılır. Belirli bir cihaz modeli gerektirmez; her modelde fiziksel test yapıldığı anlamına gelmez.
- Uygulama simgeleri, standalone manifest ve PDF.js dahil 209 dosyalık çevrim dışı paket vardır. Dosyalar bütünlük özetiyle doğrulanmadan yeni sürüm kurulmaz. Ağ kapalıyken not açma/yazma, cihazdan PDF ekleme ve JSON yedekleme otomatik tarayıcı testleriyle sınanır.
- Güncelleme açık defteri zorla yenilemez; tüm eski uygulama ve sekme pencereleri kapanana kadar bekler. Önce kayıt tamamlandı bilgisini bekleyin, JSON yedeği alın, sonra bütün Bilge Defter pencerelerini kapatıp yeniden açın. Başarısız indirmede eski paket korunur. Güncelleme denetimi 15 saniye sonunda beklemeyi bırakır.
- HTTPS adresi ve ana ekran uygulaması ayrı yerel depolama kullanabilir. Eski HTTP adresinde Yedek al; yeni uygulamada Yedek yükle ile önizlemeyi kontrol ederek aktarın. Yükleme hedefteki mevcut defterlerin yerine geçer. Kaynak notlar otomatik silinmez veya taşınmaz; sunucu eşitlemesi eklenmedi.
- Çevrim dışı paket hazır göstergesini bekleyin ve uygulamayı yeniden açın. Tarayıcı depolamayı silebilir; PWA kurulumu bağımsız yedek değildir. Gerçek iPad/Android kurulumu, kalem ve uzun süreli çevrim dışı kullanım kabulü ayrıca gereklidir.
- HTTPS geri alma yalnız bu hizmet için `tailscale serve --https=8443 off` ile yapılır. Ağ genelindeki MagicDNS/HTTPS ayarlarını bu işlem kapatmaz. v19 uygulama sürümü geri dönüş için korunur; bu sürümün çevrim dışı PDF kapsamı eksiktir.

## v19: PDF yakınlaştırma ve yatay gezinme

- PDF üstündeki − / + düğmeleri %100–%300 arasında, 25 puanlık adımlarla büyütür. Genişliğe sığdır %100'e döndürür; iki parmakla sağa/sola ve yukarı/aşağı kaydırılır. Sıkıştırma hareketiyle büyütme eklenmedi.
- PDF ve mürekkep aynı belge koordinatlarında büyür; eski yazılar taşınmaz. Silgi yalnız mürekkebi etkiler. Sayfa başına yakınlaştırma ve gezinme konumu kayda, JSON yedeğine, kopyaya ve Çöp Kutusuna dahildir.
- Yakınlaştırma görünür merkez çevresindedir; yatay gezinme sayfa genişliğinde durur. Dikey not alanı uzamaya devam eder. Normal defter sayfalarının davranışı değişmez. Etkin çizgi sırasında yakınlaştırma engellenir.
- Saklanan 1000 piksel görüntü büyütülür; özgün PDF/vectör çözünürlüğü geri kazanılmaz. Daha keskin büyütme ve notlu PDF dışa aktarma sonraki işlerdir. 20 MB / 50 sayfa sınırı değişmedi.
- Önce JSON yedeği alın ve eski açık sekmeleri kapatıp v19'u açın. Yerelde 96 otomatik kontrol grubu geçti; fiziksel tablet/Safari ve uzun kullanım performansı ayrıca kabul edilmelidir. Bu sürüm HTTPS/çevrim dışı kabulü değildir.

## v18: 20 MB ve 50 sayfa PDF sınırı

- Dosya kabul sınırı 20 × 1024 × 1024 bayt, sayfa sınırı 50 oldu. Arayüz ve hata mesajları aynı sınırları gösterir; 50 sayfalık kayıtlar ve yedekler okunur.
- 1000 px genişlik, 100–3000 px yükseklik, tek görüntü 6 MB ve toplam görüntü 24 MB korumaları değişmedi. Dolayısıyla 20 MB altında / 50 sayfalık bir dosya, görüntü sınırına takılabilir. Bu durumda mevcut notlar değişmez.
- Tam 20 MiB boyutunda dolgu içeren PDF ile bayt sınırı; 50/51 sayfalık hafif test dosyalarıyla sayfa sınırı sınanır. Bunlar yoğun taranmış PDF veya fiziksel tablet performansı kanıtı değildir.
- v17, 20 sayfa üzerindeki yeni PDF kayıtlarını açmaz; güncelleme öncesi JSON yedeği alın ve açık sekmeleri v18'e yenileyin. Kayıt şeması ve yedek biçimi değişmedi.

## v17: PDF üzerine not — ilk dilim

- Araçlar → PDF üzerine çalış → Cihazdan PDF seç → Yeni deftere ekle. Dosya yalnız tarayıcıda işlenir, sunucuya gönderilmez. PDF.js 6.3.289 ve kaynakları aynı test sunucusundan gelir; üçüncü taraf CDN yoktur.
- İlk sürüm sınırları: dosya 10 MB, 20 sayfa; görüntü genişliği 1000 px, yükseklik 100–3000 px. Görüntüler için ayrıca toplam 24 MB / tek sayfa 6 MB kodlanmış veri sınırı vardır. Şifreli PDF, metin seçimi, bağlantılar, form düzenleme, yakınlaştırma ve notlu PDF dışa aktarma yoktur.
- PDF sayfaları görüntüye dönüştürülür ve yeni deftere eklenir. Orijinal dosya saklanmaz; özgün PDF'yi ayrıca koruyun. Büyük/taranmış belgelerde bu ilk sürümün keskinliği ve hızı fiziksel tablette ayrıca ölçülmelidir.
- Oklarla veya Sayfalar panelinden sayfa değiştirin. Kalem/fosforlu/silgi yalnız bağımsız mürekkep katmanını etkiler; PDF zemini silinmez. İki parmakla kaydırma, yeniden açılış, sayfa kopyası/taşıma ve Çöp Kutusu desteklenir. PDF altına da not yazılabilir.
- PDF zeminiyle yazı aynı belge koordinatlarını kullanır; ekran yönü değişiminde göreli yer korunur. Sayfa rengi yalnız PDF dışındaki zemini değiştirir, PDF'nin beyaz arka planını değiştirmez.
- PDF ekleme önce hazırlanır, açık onayla ve tek kayıt işlemiyle tamamlanır. Hata/iptal eski defterleri değiştirmez; eski sekme yeni kaydı ezemez. Önceki çalışma alanı yükleme öncesi kurtarma kopyasıdır.
- PDF içeren çalışma alanı kayıt şeması 2 ve JSON yedek biçimi 4 kullanır. Eski sürümler bu kaydı açmaz; v16'ya dönüş PDF verisini düzenleyemez. v17 eski kayıtları/yedekleri okumaya devam eder. Yedek PDF görüntülerini ve mürekkebi içerir, orijinal PDF değildir.
- Önce JSON yedeği alın, eski açık sekmeleri kapatıp v17'yi açın. Kayıt tamamlanmadan kapatmayın. JSON tüm çalışma alanını içerir; çok sayıda PDF ile uzun süreli performans henüz kabul edilmedi.
- PDF için 11 yerel otomatik kontrol grubu geçti. Fiziksel iPad/Android kabulü ve HTTPS/çevrim dışı kabulü ayrıca bekliyor. Bu dilim tüm PDF aşamasının tamamlandığı anlamına gelmez.

## v16: temizleme öncesi kalıcı kurtarma kopyası

- Sayfayı temizle onaylandığında önceki yazıların bağımsız kopyası Çöp Kutusuna alınır. Adı temizleme öncesi ile biter; yeni bir kimliği vardır. Boş sayfada veya vazgeçildiğinde kopya üretilmez.
- Kopya çizimleri, silme izlerini, rengi, defteri ve kaydırma konumunu korur. Geri getir ayrı bir sayfa açar; temizlenen sayfaya sonradan yazılanları ezmez. Yeniden açılış ve JSON yedeğiyle kurtarılabilir.
- Açık oturumdaki Geri al sürer; kullanılması Çöp Kutusundaki kopyayı değiştirmez veya silmez. Tekrarlanan temizlemelerin kopyaları otomatik silinmez; yer kaplar. Gerekirse bağımsız yedek aldıktan sonra Çöp Kutusundan kalıcı silin.
- Temizleme ve kopya aynı kayıt işlemindedir. Kayıt başarısızsa eski disk kaydı korunur; hata mesajı, acil yedek ve yeniden deneme açık kalır. Kayıt tamamlanmadan kapatmayın.
- Yerelde 75/75 otomatik kontrol grubu geçti. Fiziksel tablet kabulü ayrıdır; bu hâlâ HTTP test yayınıdır, çevrim dışı kabulü tamamlanmadı.

## v15: silinen sayfaları geri getirme

- Sayfayı sil, sayfayı Çöp Kutusuna taşır. Sayfalar panelinden Çöp Kutusu açılır; Geri getir çizimleri, rengi ve kaydırma konumunu korur. Silinen eski defter yoksa sayfa Genel'e döner.
- Çöp Kutusu yeniden açılışta korunur; otomatik temizlenmez. Kalıcı sil ayrı onay ister. Uygulamanın son etkin sayfası silinemez. Sayfayı temizle bu özellikten ayrıdır; onun geri alması yalnız açık oturumdadır.
- Çöp Kutusunda sayfa içeren JSON yedeği biçim 3 kullanır. v15 eski biçimleri de okur; v14 biçim 3'ü reddeder. Yedek yükle mevcut defterlerle Çöp Kutusunu birlikte değiştirir; yükleme öncesi kurtarma kopyası ikisini de içerir.
- Güncellemeden önce kayıt tamamlanmasını bekleyin, bağımsız JSON yedeği alın ve eski açık sekmeleri kapatıp v15'i açın. Tarayıcı verileri silinirse Çöp Kutusu da silinir; bağımsız yedeğin yerini tutmaz.
- Yerelde 68 kontrol grubu geçti; fiziksel tablet kabulü ayrıdır. Notlar sunucuya gönderilmez.

## v14: sayfa rengi ve hızlı silgi boyutu

- Araçlar içinde altı açık zemin rengi ve özel renk seçimi vardır. Yalnız açık sayfa etkilenir; eski sayfalar krem görünür. Renk kopyalama, defterler arasında taşıma, yeniden açılış ve JSON yedeğinde korunur.
- Mevcut yazı rengi değiştirilmez. Koyu zeminde kılavuz çizgileri açılır; koyu yazı için uygun kontrastı kullanıcı seçmelidir. Boş defterlerde renk ayarı devre dışıdır.
- Hızlı silgi modunda kenarda Boyut düğmesi görünür. 8/16/32/64 px hazır seçim, 1–64 px sürgü ve gerçek CSS çapıyla daire önizlemesi vardır. Kalem/fosforlu kalınlığı ayrı kalır.
- Hızlı boyut ve Araçlar kalınlığı eşzamanlı güncellenir. Silgi boyutu yalnız açık oturumda hatırlanır; kayıtlı silme izlerinin boyutu ise notla birlikte kalıcıdır. Yeniden açılışta araç ayarları varsayılana döner.
- Aktif çizgi sırasında hızlı boyut/sayfa rengi değişikliği kabul edilmez. Silgi mürekkebi kaldırır, sayfa zeminini silmez.

## v13: defter / ders gruplama

- Sayfalar panelinde defter seçimi, Yeni defter ve Defteri düzenle bulunur. Defter adını örneğin Anatomi veya Fizyoloji yapabilirsiniz; bu ilk dilimde tek düzey gruplama vardır.
- Önceden kayıtlı sayfalar içerikleri ve kimlikleri değiştirilmeden Genel altında görünür. Yeni defter boş başlar; seçili boş defter ve yeni sayfalar yeniden açılışta korunur.
- Sayfa menüsünden başka deftere taşıma yapılır; çizimler, sayfa kimliği ve kaydırma konumu korunur. Sıralama yalnız seçili defter içinde çalışır; sayfa kopyası aynı deftere bağımsız çizimlerle eklenir.
- Genel kalıcıdır. Diğer defterler yalnız boşken ve onaydan sonra silinir; dolu defteri silme ve toplu sayfa silme yoktur. Uygulamadaki son sayfa da korunur.
- Yedek al tüm defterleri içerir. Gruplu yedekler biçim 2 kullanır; v13 bunları, biçim 1'i ve eski düz JSON yedeklerini okuyabilir. v12 biçim 2'yi reddeder. Eski sürümlerden gruplu yedek dışa aktarmayın; tüm açık sekmeleri v13'e yenileyin.
- Eski düz yedek yüklenirse bütün mevcut defterler onunla değiştirilir ve sayfalar Genel altında açılır; önizleme bunu belirtir. Yükleme öncesi yerel geri dönüş kopyası devam eder.
- Defterler aynı tarayıcıdaki tek çalışma alanının gruplarıdır; ayrı kullanıcı hesabı, yetki sınırı veya sunucu eşitlemesi değildir.

## v12: sürümlü yedek ve yükleme önizlemesi

- JSON yedekleri dosya biçimi sürümü, uygulama sürümü ve tam tarih/saat içerir; dosya adları saat ve milisaniyeye kadar ayrılır. Sayfalar üst düzeyde korunarak eski sürümlerin okuyabilmesi sürdürülür.
- Yedek yükle önce dosya adı, tarih, sayfa/çizgi sayısı ve ilk 20 sayfa adını gösterir. Bu liste sınırı yalnız önizlemededir; yedekteki sayfa sayısını sınırlamaz.
- Mevcut defterin yedeğini önizlemeden indirebilir, Vazgeç/Kapat/Escape ile notlara dokunmadan çıkabilirsiniz. Yükleme yalnız Mevcut defterin yerine yükle düğmesiyle olur; birleştirme değildir.
- Eski geçerli JSON dosyaları kabul edilir. Desteklenmeyen/eksik yeni biçim sürümü, bozuk içerik veya geçersiz koordinatlar notların yerini alamaz. Tarih bilgisi olmayan eski yedekler açıkça belirtilir.
- Yükleme sırasında kayıt hatası veya başka sekmeyle çakışma olursa mevcut kayıt korunur. v10 yükleme öncesi geri dönüş kopyası devam eder.
- İndirme başlatılması dosyanın cihazda saklandığını doğrulamaz; Dosyalar/İndirilenler içinde kontrol edin. Bağımsız sunucu yedeklemesi ve eşitleme yoktur.

## v11: iki parmakla uzayan dikey yazı alanı

- İki parmak yukarı/aşağı sürüklenince sayfa kayar; alt sayfa sınırı yoktur. Yukarı dönüş başlangıçta durur. Bilgisayarda tekerlek/izleme dörtgeni de kaydırır.
- İlk dokunuştan oluşan geçici iz, ikinci parmak kaydırmaya başladığında kaldırılır. Bir parmak kaldırıldıktan sonra kalan parmak çizgi çizmez; iki parmak da kaldırılınca normal girişe dönülür.
- Kalem veya fare aktif çiziyorken avuç/parmak temasları kaydırmayı başlatmaz. Avuç koruması açıkken de iki parmakla gezinilebilir.
- Görünen alan kadar tuval çizilir; notlar sayfa koordinatlarında saklanır. Eski çizgiler taşınmaz. Kaydırma konumu her sayfada kayıt/yedeğe dahildir; eski yedekler başlangıçta açılır.
- Araçlar içindeki Sayfanın başına dön düğmesi başlangıca götürür. Fiziksel tablet hareket testi ayrıca gereklidir.

## v10: kayıt ve kesinti güvenliği

- Biten çizgi ve sayfa işlemleri 250 ms beklemeden kayıt kuyruğuna girer. Başarı yalnız en güncel değişiklikler işlendiğinde gösterilir.
- Uzun çizim sırasında 500 ms aralıklı ara kayıt; sekme gizlenirken/sayfadan ayrılırken eldeki çizgiyi sonlandırıp kaydetme denemesi vardır. Kaydedilmemiş değişiklikte tarayıcının desteklediği ayrılma uyarısı istenir.
- Ani güç kaybı veya işletim sisteminin tarayıcıyı öldürmesi için sıfır veri kaybı garantisi yoktur. Kayıt tamamlandı göstergesini bekleyin; bağımsız JSON yedek alın.
- Başarısız kayıtta ekrandaki notlar tutulur; yeniden deneme ve acil dışa aktarma sunulur.
- İkinci sekme kayıtlı defteri değiştirmişse üzerine yazma engellenir; bu sekmenin yedeği alınabilir. Otomatik birleştirme yoktur; eski sürüm açık sekmelerini kapatıp yenileyin.
- Yedek yükleme veritabanına başarıyla yazılmadan ekrandaki defter değişmez. Önceki defter aynı işlemde yerel geri dönüş kopyası olur; Araçlar içinden geri getirilebilir. Bu tek kopya aynı tarayıcıdadır, bağımsız/sunucu yedeği değildir.

## v9: hızlı kalem/silgi ve sayfa yönetimi

- Araçlar düğmesinin üstündeki hızlı düğme kalemden silgiye, silgiden kaleme geçer. Fosforludan basılırsa önce silgiye geçilir; geri dönüş kalemedir. Açık çizgi sırasında araç değişmez.
- Her aracın kalınlığı bu açık oturum boyunca ayrı hatırlanır. Yeniden açılışta kalem/fosforlu temel kalınlığı 4, silgi 12 olur; notların çizgi genişlikleri değişmez.
- Sayfalar panelinde her sayfanın yanındaki üç nokta; adlandırma, bağımsız kopyalama, yukarı/aşağı sıralama ve onaylı silme sunar. Son sayfa silinemez. Silme geri alınamaz; önce yedek alın.
- Adlar, sıra ve kopyalar mevcut IndexedDB ve JSON yedeğiyle saklanır. Veri biçimi değişmemiştir.

## v8: kenardan açılan araç penceresi

- Sağ kenardaki Araçlar düğmesi tüm eski üst araçları ve ayarları tek pencerede açar. Üst araç çubuğu kaldırılmıştır.
- Kalem, fosforlu, silgi, renk, kalınlık, avuç içi koruması, geri al, sayfayı temizle, yedekleme ve web araması bu pencerededir.
- Beş örnek çizgi seçilebilir; sürgü ara kalınlıkları ayarlar. Örnekler ve büyük önizleme seçilen aracın gerçek çizgi genişliğini, rengini ve fosforlu saydamlığını gösterir. Silgi genişliği gri çizgiyle temsil edilir.
- Kapat, Yazmaya dön, pencere dışına basma veya Escape ile kapanır. Pencere açılırken/kapanırken çizim yüzeyinin boyutu ve not koordinatları değişmez.
- Web araması yalnız düğmedendir; çizim yüzeyinde arama hareketi yoktur. Yerel veri adı ve yedek biçimi değişmemiştir.

## v7: kompakt araçlar ve düğmeyle web araması

- Kalem, fosforlu ve silgi tek kompakt simge grubundadır; dokunma hedefleri 44 × 44 pikseldir. Seçili araç koyu renkle belirtilir.
- Arama alanı yalnızca Web’de ara düğmesiyle açılır. Üç dokunuş kısayolu kaldırılmıştır; tekrarlanan kalem dokunuşları normal çizim olarak korunur.
- Aranacak kelime elle girilir; el yazısı tanıma yoktur. Arama yalnızca Google’da ara düğmesine basılınca yeni sekmede açılır.
- Avuç teması ve uzun basma aramayı açmaz. Çizim yüzeyinde tarayıcının metin seçimi ve uzun basma menüsü engellenir.
- Web’de ara düğmesi, kalem türünü tanımayan cihazlarda da kullanılabilir.
- Notlar aynı adreste ve aynı yerel veritabanında tutulur.

## Tablet kabul testi

v6: Sayfayı temizle düğmesi onaydan sonra yalnız açık sayfanın çizimlerini temizler. Son temizleme aynı açık oturumda Geri al ile geri getirilebilir; sayfayı yenilemek bu geri alma kopyasını kaldırır. Diğer sayfalar etkilenmez.

v5: Sayfalar paneli başlangıçta kapalıdır. Üstteki Sayfalar düğmesi açar; sayfa seçmek, yeni sayfa oluşturmak veya yazı alanına dokunmak otomatik kapatır. Panel yazı yüzeyinin üstünde açılır, kalem çizgisinin koordinatlarını değiştirmez. Dar ekranlarda da aynı düğmeyle erişilir.

1. iPad Safari ve Android Chrome üzerinden HTTPS adresini aç.
2. Kalemle yaz; parmakla istenmeyen çizgi oluşmadığını kontrol et.
3. Sayfa ekle, çiz, sekmeyi kapat ve yeniden aç; içeriğin kaldığını doğrula.
4. Cihazı yatay/dikey döndür; mevcut çizginin korunmasını kontrol et.
5. `Yedek al` ile JSON indir, yeni sayfa ekle ve eski yedeği geri yükle.
6. Uygulamayı ana ekrana ekle; bir kez açtıktan sonra ağ kapalıyken yeniden açmayı dene.

Gerçek cihaz sonuçları kaydedilmeden kalem rahatlığı, avuç içi reddi veya çevrim dışı güvenilirlik doğrulanmış sayılmaz.
