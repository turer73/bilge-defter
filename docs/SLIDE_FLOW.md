# Defter içinde kesintisiz slayt görünümü

Durum: yerel geliştirme. Bu belge canlı yayın veya fiziksel iPad kabulü değildir.

## Kapsam

- Deftere aktarılmış PowerPoint sayfalarını, mevcut defter sırasıyla aşağı doğru kaydırmak.
- Slaytları başlangıçta görünüm alanının genişliğine otomatik sığdırmak; ek slayt
  gezinme barını kaldırmak. Yakınlaştırma ve normal defter araçları korunur.
- Kalem, fosforlu, silgi ve defter araçlarını korumak.
- Normal boş sayfaları, normal PDF gezinmesini ve eski ayrı sunum okuyucusunu değiştirmemek.

## Veri ve performans sınırları

Görüntü zemini ve sayfaya ait notlar ayrı kalır. Yeni bir kayıt veya yedek biçimi
oluşturulmaz. Sayfalar yeniden sıralanmaz; boş sayfa veya PDF araya girerse sürekli
slayt dizisi orada biter. Önceden slaytın altına yazılmış notlar görünüm yüksekliğine
dahil edilmelidir.

Görüntü ve kalem için mevcut iki görünüm tuvali kullanılır. Sunumdaki bütün sayfalar
için dev tuval oluşturulmaz. Yalnız görünen slaytlar ve sınırlı yakın komşuları
çözülür. Kalem hareketi boyunca sayfa hedefi sabit kalır; silgi komşu sayfayı etkilemez.

Kaydırırken aynı çizgileri tekrar hesaplamamak için yalnız görünen mürekkep
parçaları, toplam 8 milyon tuval pikseliyle sınırlı geçici tuvallere alınır.
Bu yaklaşık 32 MB ham RGBA alanıdır; uygulamanın toplam RAM sınırı değildir.
Aktif çizim ve öğe taşıma bu önbelleği kullanmaz; değişiklik/geri alma, ölçek ve
görsel yüklenme durumu önbelleği geçersiz kılar. Yoğun bir sayfanın ilk çizimi
hâlâ pahalı olabilir; sıcak önbellek ölçümü fiziksel iPad akıcılık kabulü değildir.

Kaydırma konumu en fazla yarım tuval pikseli yuvarlanır (DPR en fazla 2); çizim ve öğe seçimi
aynı gerçek konumu kullanır. Doğrudan çizim ile önbelleğin renk kanallarının her
olası belgede bit düzeyinde eşitliği garanti edilmez. Test, sınırlı kenar yumuşatma farkını ölçer; yeni çizginin
görünmesi, silinmesi ve öğe geri alması ayrıca küçük bölgelerde kontrol edilir.

## Kabul kontrolleri

- İki komşu slayt aynı anda görülebilir; tekerlek ve iki parmak hareketinde sayfa
  değiştirme sıçraması olmaz.
- İkinci görünen slayta dokunmak çizgiyi doğru sayfaya kaydeder. Kalem veya avuç
  hareketi sürerken hedef kendiliğinden değişmez.
- Slayt altındaki eski notlar, metinler ve görseller korunur.
- Kayıt, yeniden açma ve JSON yedek biçimi geçerlidir.
- Ekran boyutu değişimi, yakınlaştırma, silme/geri alma ve karışık defter kontrol edilir.
- 100 slaytta görüntü önbelleği ve tuval boyutları görünümle sınırlı kalır.
- Hesap kilidi, kayıt çatışması veya açık düzenleme varken yeni çizgi başlatılmaz.

Yerel otomasyon: `node work/verify-slide-flow.cjs --dpr=1` ve
`node work/verify-slide-flow.cjs --dpr=2` (Chromium ve WebKit).
Sonuçlar `outputs/slide-flow/dpr-1/` ve `outputs/slide-flow/dpr-2/` altındadır. Gerçek iPad'de kalem, avuç, iki parmak
kaydırma ve uzun ders kullanımı ayrıca denenmelidir. Yerel önizleme canlı hesapla
eşitlenmez; canlı uygulamadaki notları buraya otomatik taşımaz.

## 7 Ekim 2026 yerel doğrulama

- Slayt akışı: Chromium 20/20, WebKit 20/20, toplam 40/40; kaynak sapması yok.
- PowerPoint ekleme/kayıt/iptal: 86/86; kaynak sapması yok.
- Gerçek yayımlanmış v76 ile kayıt ve yedek uyumluluğu: 14/14; kaynak sapması yok.
- `node work/verify-v77.cjs`: mevcut 26 regresyon süitinin tamamı geçti; kayıt,
  varlık deposu, kalem/avuç, normal PDF, yakınlaştırma, kütüphane ve yerel gerçek
  service-worker güncelleme senaryoları dahil. Sunucu çağrıları sentetiktir.
- 100 farklı slayt ve tek ekrana sığan 33 kısa slayt kontrol edildi. Tuval boyutu
  tüm desteye değil görünüm alanına bağlı kaldı.
- Mürekkep görüntü karşılaştırması: beyaz üzerinde en büyük kanal farkı 32/255,
  ön plan ortalaması 1/255 ve 16'dan fazla farklı piksellerin oranı %0,2 ile
  sınırlıdır. İlk hatalı alt-piksel çiziminin saklanan ölçümleri bu kapıdan geçmez.
  Sıcak önbellekte üç yeniden çizimde çizgi geometrisi tekrar hesaplanmadı.
- Ayrı yoğun çizim deneyi: 100 sayfa, 10 sayfada 750 çizgi × 100 nokta. Masaüstü
  Chromium/WebKit ilk çizim yaklaşık 228/382 ms, sıcak tekrar 0,1–0,6 / 0–1 ms;
  kalem değişikliği sonrası ilk tekrar 128/189 ms oldu. 80 hareket olayı eşzamanlı
  tam çizim başlatmadı, ilk animasyon karesine tek çizim toplandı. Bunlar sentetik
  masaüstü ölçümleridir; gerçek iPad için 60 FPS veya ilk açılış hızı garantisi yoktur.

### Tarihsel açık Retina görüntü kalitesi kontrolü — 7 Ekim

Yukarıdaki 40 otomatik akış kontrolü DPR 1 ile çalışır. Ayrı DPR 2 deneyinde
kaydırma, kalem sahipliği, koordinatlar ve önbellek sınırı geçti (12 parça,
2.483.856 tuval pikseli). Ancak yoğun, 15 kez üst üste aynı çizgilerin bulunduğu
örnekte 32/255 en büyük fark kapısı **geçmedi**: Chromium 119, WebKit 133 alfa
farkı; ön planda 16'dan büyük farkların oranı yaklaşık %0,0065 / %0,0094.
Referanstaki opak piksellerin kaybı görülmedi. Farklar sayfa/parça sınırında değil,
çizgi başlangıcının kenar yumuşatmasında ek alfa olarak ölçüldü. Kesin neden
kanıtlanmadı; küçük raster farkının tekrar eden katmanlarda büyümesi olasıdır.
Eşik genişletilmedi, Retina görüntü kalitesi geçmiş sayılmadı. Bu yerel deneme
canlıya alınmadan önce bu kalite farkı ve fiziksel iPad kabulü değerlendirilmelidir.

Önizleme `http://127.0.0.1:8780/?preview=notebook` adresindedir. Açık sekmeyi
yenilemeden önce kayıt tamamlanmalıdır; tarayıcı verisini temizlemek gerekmez.
Bu değişiklik için commit, push, canlı yayın veya gerçek cihaz kabulü yapılmadı.

## Ek slayt barı — 7 Ekim yerel düzeltme

Kullanıcının gösterdiği dosya adı, slayt sayısı, ileri/geri, yüzde ve genişliğe
sığdır düğmeleri `pdfNavigation` barıdır. Bu bar artık `.pptx` adlı bütün defter
zeminlerinde gizlenir; görünürlük, sürekli akış motorunun o anda etkin olmasına
bağlı değildir. Eski/farklı boyutlu slaytta veya başlangıç/kilit durumunda da
bar ve ona ayrılan ek grid satırı açılmaz. Dosya adı büyük/küçük harf duyarsızdır.
Normal PDF barı, ana defter araçları, alt yakınlaştırma ve sayfa listesi korunur.
Notlar, slayt sırası ve kayıt biçimi değiştirilmez.

Ekran görüntüsünün eski açık sekmeden mi yoksa farklı boyutlu bir kayıttan mı
geldiği doğrulanmadı. Düzeltme, görünürlük kuralını her iki akıştan bağımsız
uygular; gerçek kullanıcı notları okunmadı veya yeniden aktarılmadı.

Son doğrulama: genişletilmiş akış süiti Chromium 21/21 ve WebKit 21/21, toplam
42/42 geçti; kaynak sapması yok. Yeni vaka hazır olmayan durum, eski 1200 px
`.PPTX` ve akış API'si bulunmaması durumlarında gizli bar/sıfır yükseklik/tek grid
satırını kontrol eder. Normal PDF ve ana defter araçları testleri de geçti.
Tablet regresyon çalıştırıcısı ve 243 dosyalık manifest kontrolü başarılıdır.
Yerel 8780 önizleme yeni kaynağı sunar; açık kullanıcı sekmesi yenilenmedi.
Bu bar düzeltmesi, yukarıdaki ayrı Retina kalite sınırını kapatmaz.

## 8 Ekim 2026 — yoğun çizimde raster kalite düzeltmesi

7 Ekim'deki başarısız kanıt korunmuştur. Genişletilmiş yoğun çizim testi eski
kaynakta **DPR 1'de de** başarısız oldu: Chromium 119, WebKit 133 en büyük alfa
farkı. Önceki DPR 1 akış vakaları bu yoğunluğu kapsamıyordu. Negatif kaynak
SHA-256'sı `0d32d103ee05876dcd9299f1e40b4947c622eee84bdaf2ac2696d3473eee1f75`;
kanıtlar `outputs/slide-flow/dpr-1-negative/` ve `dpr-2-negative/` altındadır.
Kalite eşikleri değiştirilmedi.

### Çözüm ve sınırları

Küçük parça tuvalleri içinde vektörleri yeniden rasterlamak yerine, eksik
parçaların çizgileri **gerçek görünüm tuvalinin aynı kökeni, boyutu, dönüşümü ve
sayfa kırpmasıyla** çizilir. Gereken tam piksel dikdörtgenleri bu tuvalden küçük
önbellek tuvallere kopyalanır. Sayfaya ait eksik dikdörtgenlerden herhangi birine
değen çizgiler birlikte ve özgün sırada işlenir; aralarındaki gereksiz büyük alan
tek birleşik kutu olarak çizilmez. Silgi ve fosforlu katman sırası korunur.

- Tüm görünür sayfaların geçici çizim/kopyalama aşaması, son görüntüyü oluşturmadan
  **önce** biter. İkinci slayttaki önbellek eksikliği, ilk slaytta basılı kalemin
  çizgisini temizleyemez; bu durum gerçek pointer olaylarıyla sınanır.
- Her parçanın gerçekten dolu alanı izlenir. Kaydırmada yalnız değişen eksendeki
  eski/yeni görünüm kenarı bandı yeniden çizilir. Önceden tuval kenarında üretilmiş
  pikseller, kenar yumuşatma farkıyla iç alana taşınmaz. Düşey kaydırma sabit
  sol/sağ kenarların tekrar tekrar çizilmesini gerektirmez.
- Kenar bandı, çizgi segmentlerinin eksen uzunluğu ve kalınlığını hesaba katar.
  Çok uzun segmentler veya çok kalın kalemler daha fazla yeniden çizim gerektirir.
- Ek tam ekran geçici tuval açılmaz; mevcut mürekkep tuvali eşzamanlı geçici
  yüzeydir. Parça önbelleği hâlâ en fazla 8 milyon piksel tutar.
- Görünür bir satırın parçaları bütçeye sığmıyorsa o satır bütünüyle, doğrudan ve
  aynı sayfa kırpmasıyla çizilir. Parça-kırpılmış yedek yol kullanılmaz. Bu durumda
  sıcak tekrarın sıfır geometri maliyeti olacağı vaat edilmez.
- Eski okuyucunun kabul ettiği `p:4` gibi cihazın 0–1 aralığı dışındaki basınç
  değerleri değiştirilmez. Bu satır önbellek ve dar görünürlük elemesinden geçmeden
  çizilir; yeni kalem basılıyken de aynı kural uygulanır. Bitmiş çizgilerin basınç
  kontrolü nesne/nokta dizisi/uzunlukla önbelleklenir. Kayıt, doğrulama veya yedek
  şeması değiştirilmez; veri göçü yoktur.

Yoğun test; 100 sayfanın ilk 10'unda 750 çizgi × 100 nokta, aynı başlangıçların
15 kez üst üste gelmesi, gerçek yeni kalem, kesirli kaydırma, parça giriş/çıkışı,
1,5 yakınlaştırma, yatay kaydırma ve değişken basınçlı düşey uçları kapsar.
Normal kalem/silgi/öğe geri alma karşılaştırması ayrıca korunur. Bu ölçümlerde
referans aynı büyüklükte görünüm tuvaline çizgileri sırayla doğrudan çizer;
önbellek kodunu referans olarak tekrar kullanmaz.

Basılı kalem için ek negatif kontrol de saklanır:
`outputs/slide-flow/dpr-1-held-pressure-negative/report-accepted-legacy.json`
iki motorda başarısızdır. Aynı testin düzeltme sonrası DPR 1 ve DPR 2 sonuçları
`dpr-1-held-pressure-fix/` ve `dpr-2-held-pressure-fix/` altında 2/2 geçer;
hem boşta hem basılı kalemde eski basınç değeri korunur ve RGBA farkı sıfırdır.

### Son üretilmiş v78 paketinde doğrulama

`BILGE_TEST_ROOT=work/bilge-defter-invited-v78` ile iki tam komut çalıştırıldı:
DPR 1 **50/50**, DPR 2 **50/50**, toplam **100/100**; iki raporda da kaynak
sapması `[]`. Her DPR'de Chromium 25 ve WebKit 25 vaka çalıştırır. Basılı kalem
basınç düzeltmesi bu son pakete ve raporlara dahildir.

- Paket manifesti SHA-256:
  `a4d32169cc0dd3a8e032960d210093149e0da0d23669ceafe8123566100d668c`.
- `pdf-workspace.js` SHA-256:
  `b0737f159b188faa810594ed1f9372615e9a07d16d36a49cd23f1fe1a5cbf7ab`.
- Test çalıştırıcısı SHA-256:
  `c13e84cc6b93f21d1b8f9ed8e4a367ae37724fc599877c411bfb6db88b84fdf0`.
- `outputs/slide-flow/dpr-1/report.json` SHA-256:
  `bff57852d37687058e87317d42ab49c2227094dd6b96d53fc603f34b78172693`.
- `outputs/slide-flow/dpr-2/report.json` SHA-256:
  `5764fb0d889a49f53ce704e4982d18c2a33dc5043c44546d74c77f29e34b64db`.

İki motorda ve iki DPR'de, yoğun testin sekiz aşaması ile normal
kalem/silgi/öğe geri alma/yakınlaştırmanın beş aşamasında ölçülen en büyük alfa
ve beyaz üzerinde kanal farkı **0** oldu. Sıcak, bütçeye sığan önbellekte çizgi
geometrisi çağrısı **0** kaldı. Bu ölçülen örneklere aittir; tüm olası içerikler
için bit eşitliği vaadi değildir ve otomatik testin 32/1/%0,2 eşikleri değişmedi.

Bütçe yedek yolu gerçek görünüm boyutu büyütülerek sınandı; uygulama CSS'i veya
8 milyon sınırı değiştirilmedi. DPR 1 görünümü 9.083.920, önbelleği 7.997.034
piksel; DPR 2 görünümü 9.335.320, önbelleği 7.987.428 piksel oldu. Her iki
motorda doğrudan yedek çizim gerçekten çalıştı ve referans farkı **0** kaldı.

### Ayrı performans deneyi

Piksel okumalarının tarayıcıyı farklı raster yoluna geçirme etkisini karıştırmamak
için süreler ayrı, yeni tarayıcı bağlamlarında **`getImageData` çağrısı olmadan**
ölçüldü. Aşağıdaki yoğun durum 750 × 100 noktalıdır; ms değerleri masaüstü
Chromium/WebKit sentetik ölçümüdür, fiziksel iPad garantisi değildir.

| Motor / DPR | Soğuk çizim | Sıcak tekrar | Kaydırma / ilk hareket | Kalem sonrası |
| --- | ---: | ---: | ---: | ---: |
| Chromium / 1 | 62,8 | 0,2–0,5 | 5,8–12,6 / 41,5 | 59,6 |
| WebKit / 1 | 10 | 0–1 | 1–4 | 7 |
| Chromium / 2 | 85,5 | 0,3–0,7 | 7–18 / 53,9 | 82,6 |
| WebKit / 2 | 8 | 0–1 | 1–4 | 7 |

30 çizgilik seyrek durumda DPR 1 kaydırması Chromium 1,4–3,3 ms, WebKit 0–1 ms;
DPR 2'de Chromium 4–6,8 ms, WebKit 0–1 ms ölçüldü. Kanıtlar
`outputs/slide-flow/dpr-1-sliced-axis-perf/perf.json` ve
`dpr-2-sliced-axis-perf/perf.json` dosyalarındadır.

Basılı-kalem eski basınç koruması da dahil son `a4d32169…` paketinde, ayrı yeni
bağlamla DPR 2 tekrar ölçüldü (`dpr-2-final-release-perf/perf.json`). Chromium
yoğun çizim 87,4 ms, sıcak 0,4–0,6 ms, kaydırma 6,7–17,1 ms (ilk hareket 55 ms),
kalem sonrası 83,4 ms; WebKit sırasıyla 8 ms, 0–1 ms, 1–4 ms, 10 ms oldu.
Seyrek kaydırma Chromium 3,4–5,7 ms, WebKit 0–1 ms; önceki eğilim korundu.

Eski, piksel kapısını geçemeyen DPR 2 önbelleği Chromium'da çoğu sıcak kaydırmayı
0,4–0,6 ms'de yapıyordu (yeni parçanın geldiği örnek 42 ms); doğru görüntü için
kenar yenileme maliyeti artmıştır. Bu değiş tokuş gizlenmez. Her kaydırmada bütün
görünümü yeniden çizen, piksel olarak doğru başka bir deneme Chromium'da
170–189 ms/kare ürettiği için reddedildi ve kaynakta bırakılmadı.
Eski ve reddedilen ölçümler sırasıyla `dpr-2-tile-baseline-perf/` ve
`dpr-2-viewport-perf/` altında korunur.

Gerçek iPad'de Apple Pencil, avuç, iki parmakla kaydırma, bellek baskısı ve uzun ders
oturumu kabulü hâlâ ayrı testtir. Bu belge test kanıtıdır; commit, merge veya canlı
yayının yapıldığını kendi başına göstermez.

## 8 Ekim — Linux WebKit ek kalite kapısı ve kontrollü tanı

Yukarıdaki Windows sonucu Linux kabulü yerine geçmez. `57a6ce72` için GitHub
Actions `37734784617`, Ubuntu WebKit/DPR 2'de medya taşıma/geri alma aşamasında
**49/50** kaldı. Değişmemiş ikinci slaytın 13 kalem kenarı pikselinde alfa farkı
64, beyaz üzerinde en büyük kanal farkı yaklaşık 58,23 ölçüldü. Referans görüntü,
silgi aşamasındaki referansla aynıdır; ilk/kalem/silgi/yakınlaştırma aşamalarında
bu fark yoktur. Kaynak sapması yoktur. Bu, metin/görsel kaybı veya yalnız test
toleransı olarak sınıflandırılmadı; kalite eşiği gevşetilmedi ve kapı açıktır.

İndirilen kanıtlar
`outputs/direct-pptx-release-v78/ci-37734784617/slide-flow/dpr-2/` altındadır.
Tuval boyutu veya raster arka ucunun değişiminden sonra önbellek piksellerinin
yeniden kullanılması olası nedendir; bu aşamada kesin neden kanıtlanmış değildir.

Tanı yaması yalnız `work/verify-slide-flow.cjs` dosyasındadır. Uygulama
`pdf-workspace.js` dosyasının SHA-256'sı hâlâ
`b0737f159b188faa810594ed1f9372615e9a07d16d36a49cd23f1fe1a5cbf7ab`:

- Özgün sıcak görüntü, ölçüm ve başarısız assertion korunur.
- Yalnız medya geri alma kalite ölçümü başarısızsa, sentetik görünür sayfalara
  `touchPage` uygulanarak önbellek geçersiz kılınır. Sonraki doğrudan referans
  karşılaştırması **ayrı tanı sonucudur**; başarısız ölçümün yerine geçmez.
- Mürekkep içeriğinin SHA-256'sı önce/sonra karşılaştırılır. Not içeriği değiştirilmez;
  yalnız bu sentetik testin sayfa revizyonları yenilenir. Canlı hesaba işlem yoktur.
- Ana tuvalin fiziksel/CSS boyutu, dönüşüm matrisi, görünür sayfa dönüşümleri ve
  revizyonları raporlanır. Medya açma/geri alma/kapatma sırasında yalnız fiziksel
  tuval ve bağlam değerleri okunur; yeni bekleme veya üretim koduna iz eklenmez.
- `${engine}-ink-parity.json`, `${engine}-ink-surface-diagnostic.json` ve ayrı
  sıcak/soğuk PNG'ler kaydedilir. `finally`, özgün test başarısızken de tanı JSON'unu
  yazar. Soğuk karşılaştırmanın geçmesi, özgün testi başarılı yapmaz.

Hedef komut: `node work/verify-slide-flow.cjs --dpr=2 --case="warm ink"`.
Yerel Windows Chromium/WebKit kontrolü 2/2 geçti; bu Linux hatasının çözüldüğü
anlamına gelmez. Ayrı ve açıkça **yapay** tanı-akışı öz testinde yalnız özgün
`media undo` ölçümüne `alphaMax=64` enjekte edildi: soğuk ölçüm 0 ve içerik hash'i
aynı olduğu halde iki test de beklenen şekilde başarısız kaldı (0/2). Bu bir
görüntü hatası tekrarı değil, başarısızlığın tanı tarafından gizlenemediğinin
kontrolüdür. Kanıt: `outputs/slide-flow/dpr-2-diagnostic-plumbing-negative-exact/`.
Linux tanı koşusu ve ona dayanacak olası uygulama düzeltmesi ayrıca gereklidir.

### Linux tanı sonucu ve fiziksel yüzey anahtarı

Sonraki Linux tanı koşusu `37737955194`, özgün başarısızlığı beklenen şekilde
korudu. Medya geri almada sıcak alfa farkı **64** iken ayrı soğuk yeniden çizimde
farklı kanal sayısı ve alfa farkı **0** oldu; mürekkep içeriği SHA-256'sı aynıydı.
İki ölçümde de son fiziksel tuval 1676 × 1318 ve sayfa dönüşümleri aynıdır.
İz, medya düzenlerken 2260 × 1482'ye geçilip sonra eski boyuta dönüldüğünü
gösterir. Böylece hatanın not içeriğinden veya değişen referanstan değil, yeniden
kullanılan raster önbelleğinden kaynaklandığı ayrıştırıldı.

Dar uygulama düzeltmesi: `inkStamp` artık üretim tuvalinin **fiziksel genişlik ve
yüksekliğini** de kimlik olarak saklar ve karşılaştırır. Boyut değişirse o sayfanın
parçaları yeniden rasterlanır; boyut aynı kaldığı sürece mevcut kaydırma/kenar
onarımı ve sıcak tekrar davranışı korunur. Tam dönüşüm kimliğini genişleten,
kalite eşiğini değiştiren veya kayıt şemasını değiştiren ek işlem yapılmadı.
Kaynak SHA-256:
`64ce1a24e4fb7c3997d693718721ff9d08300ca68bf77f6d75d43ff5953f2eb9`.

Yeni `physical bitmap resize rebuilds ink before warm reuse` vakası, CSS veya
önbellek sınırını değiştirmeden gerçek bitmap genişliğini, yüksekliğini ve geri
dönüşünü sırayla değiştirir. Eski kaynakta iki motorda da yeniden çizim sayısı
0 olduğu için **0/2** kalır (`dpr-2-surface-key-negative/`); Windows'ta eski
kaynağın bu örnekte piksel farkı 0'dır. Bu negatif kontrol, Linux'taki 64 farkını
Windows'ta tekrar üretme iddiası değil, gerekli yüzey geçersizleştirme sözleşmesidir.

Düzeltme sonrası iki DPR ve iki motorda her boyut geçişi 6 görünür çizgiyi
yeniden çizdi; sonraki sıcak tekrar 0 çağrı, referans farkı 0 ve içerik hash'i
değişmez kaldı. Yeni vaka **4/4**, mevcut medya geri alma/silgi/kalem/yakınlaştırma
vakası **4/4** geçti (`dpr-1-surface-key-fix/`, `dpr-2-surface-key-fix/`). Test
çalıştırıcısı artık motor başına 26, DPR başına **52** vaka içerir. Linux'taki
özgün medya geri alma senaryosunun yeni kaynakla geçmesi hâlâ asıl kabul kapısıdır;
bu yerel sonuç onun yerine geçmez.
