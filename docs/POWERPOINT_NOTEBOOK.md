# PowerPoint'i normal deftere aktarma

Bu belge yeni aktarımın hedef davranışını ve kabul kapılarını tanımlar. Kodun
bulunması, testin geçmesi, yayın ve gerçek iPad kabulü ayrı durumlardır.

## Kullanım

1. Notların kaydedildiğinden emin olun; **Ekle → PowerPoint ekle** yolunu açın.
2. **Sunum seç** ile cihazdaki `.pptx` dosyasını seçin. Slaytlar otomatik
   hazırlanır; ilerleme ve seçtiğiniz dosya aynı pencerede gösterilir.
3. Hazır slayt sayısını ve hedef defteri kontrol edin. Varsayılan hedef açık
   defterdir; istenirse yeni defter oluşturulur. Hazırlık defteri değiştirmez.
4. **Slaytları ekle** düğmesine basın; düğmede eklenecek sayı da görünür.
   Kayıt tamamlandığında ana deftere dönülür. Normal kalem,
   fosforlu, silgi, geri alma, metin/görsel ve iki parmak gezinme araçları kullanılır.

Normal yolda yeniden hazırlama düğmesi gerekmez. Hazırlama hatası veya eski
kalem notları seçiminin değişmesi durumunda yeniden hazırlama seçeneği açılır.
Eski ayrı sunumlar ve `.bdpptx` yedekleri **Eski sunum veya yedekten ekle**
bölümündedir. Ekle menüsündeki eski okuyucu ve sunucuda PDF'e çevirme yolları
**Diğer sunum seçenekleri** altında tutulur; normal ekleme için gerekli değildir.

Slayt zemini görüntüdür; üzerindeki özgün PowerPoint metin ve şekilleri ayrı
düzenlenemez. Silgi yalnız eklenen notları siler. Animasyon, video, etkileşim ve
birebir PowerPoint font/yerleşim sadakati vaat edilmez. Görseli kontrol edin ve
özgün sunumu saklayın. Varsayılan yol cihazda işler; sunucu PDF dönüştürme yolunu
kullanmak veya dosyayı dışarı göndermek bu işlemin parçası değildir.

Eski ayrı sunumlar silinmez veya kendiliğinden göç ettirilmez. Seçilen eski
notların aktarımı bir kopyadır; eski kayda geri yazılmaz.

## Kayıt, yedek ve sınırlar

- Mevcut sayfalar değiştirilmez. Tüm hazırlanmış sayfalar tek işlemle eklenir;
  hata veya iptalde yarım sunum eklenmez.
- Önceki kayıt `before-import` geri dönüş kopyasında korunur. Kayıt çakışması
  başka sekmenin değişikliklerinin üzerine yazma izni değildir.
- Slayt zeminleri ve ana defter notları normal JSON yedeğine dahildir; özgün
  PPTX dosyası dahil değildir. JSON yedeğini ayrıca indirip saklayın.
- Yerel kayıt, JSON dosyası ve sunucu eşitlemesi farklıdır. Sunucu yedeğinin
  5 MiB şifreli veri sınırı yüzünden büyük sunum defterleri eşitlenmeyebilir.
- Girdi en fazla 20 MiB, belge en fazla 100 slayttır. Zemin 1000 piksel genişlikte,
  100–3000 piksel yükseklikte PNG/JPEG olarak tutulur. Bir görüntü 6 MiB,
  bir aktarım 24 MiB, hesaptaki mevcut sayfalar ve çöp kutusundaki benzersiz
  görseller dahil toplam görüntü bütçesi 96 MiB ile sınırlıdır.
- Görüntü bütçeleri mevcut uygulamada veri adresinin karakter sayısından
  hesaplanır; bunlar fiziksel RAM ölçümü veya özgün dosya boyutu değildir.
- 100 sayfa belge sınırıdır, tüm hesabın sayfa sınırı değildir. Mevcut deftere
  birden fazla belge eklenirse toplu notlu PDF çıktısının 100 sayfa sınırı ayrıca
  geçerlidir; tek sayfa çıktısı veya ayrı defter seçeneği kullanılabilir.

## Teknik sözleşme

`BilgeRasterImport.capture({guard?})` onaylı hesap, hesap DB'si, hedef defter,
durum nesnesi ve düzenleme sürümünü yakalar. `isCurrent(context)` ve
`revoke(context)` gecikmiş sonuçların uygulanmasını engeller.
Arayüz, bağlamı yakalamadan önce `settle()` ile sürmekte olan görsel ayırma ve
kaydı bekler. Aktarım sırasında eski durumu yazabilecek yeni taramalar bekletilir.

`commit({name, pages, newNotebook}, context)` her sayfa için
`{image,width,height,number,total,strokes?}` kabul eder. Sayfalar mevcut `page.pdf`
zeminine ve normal `page.strokes` dizisine dönüştürülür. Önce mevcut kayıt
tamamlanır; biçim, gerçek görüntü boyutu, toplam bütçe ve boş alan doğrulanır;
sonra `dbPut(next,{preservePrevious:true})` kullanılır. Bellekteki durum yalnız
başarıdan sonra değiştirilir. Varlık ayırma ve yeniden açılış mevcut
`storedPage` / `inflateRecord` / `scheduleAssetSweep` akışını kullanır.

Hesap, hedef veya işlem sürümü bekleme sırasında değişirse sonuç uygulanmaz.
Kalıcı yazım tamamlandıktan sonra bağlam değişirse yazım geri alınmış gibi
gösterilmez: `ImportCommitted` sonucu, eski hesabın kaydının tamamlandığını fakat
geçersiz arayüze uygulanmadığını ayırt eder.
Kalıcı yazımdan sonraki çizim hatası da aynı tamamlanmış-kayıt sonucunu verir.
İşçi yanıtı kaybolursa yeniden açılan işçi gönderilen kayıt işaretini doğrular;
tamamlanmış yazım yinelenmez ve asıl `before-import` kurtarma kopyası korunur.

## Yerel kabul testi

Ana yardımcı ve arayüz değişiklikleri hazır olduğunda:

```sh
node work/verify-pptx-notebook.cjs
node work/verify-pptx-notebook.cjs --segment=helper --engine=webkit
node work/verify-pptx-notebook.cjs --segment=ui --engine=chromium
```

Koruma kaldırıldığında ilgili testin gerçekten başarısız olduğunu göstermek
için yalnız bellekte sunulan dosyada bir guard kaldıran negatif kontroller de
vardır. Bunların beklenen çıkış kodu `1` ve hedef test sonucu başarısızdır;
uygulamanın kaynak dosyalarına dokunulmaz:

```sh
node work/verify-pptx-notebook.cjs --segment=helper --engine=chromium --case=in-flight --negative-control=asset-drain
node work/verify-pptx-notebook.cjs --segment=helper --engine=chromium "--case=render failure" --negative-control=post-commit
node work/verify-pptx-notebook.cjs --segment=helper --engine=chromium "--case=real worker commit" --negative-control=lost-ack
```

Varsayılan kaynak `work/bilge-defter-test`; `BILGE_TEST_ROOT` ile hazırlanmış
yayın klasörü seçilebilir. Test kaynak dosyalarını değiştirmez; kanıtlar
`outputs/pptx-notebook` altına yazılır. Özel öğretmen dosyası veya masaüstü
dosya yolu gerekmez. Sentetik kimlikler ve iki slaytlı yerel OOXML kullanılır.

Kapsam: ekleme/önceki kayıt, 100/101 sayfa, görüntü/sıra/boyut doğrulaması,
6/24/96 MiB bütçe, kota/kayıt/çakışma hata enjeksiyonu, gecikmiş hesap kilidi,
yinelenen gönderim, ana kalem araçları, JSON yedek/geri yükleme/yeniden açma,
gerçek menü yolu, iptal, eski sunum kaydının değişmeden kalması, `.bdpptx` dosya
aktarımı ve iki sayfalık gerçek notlu PDF indirme. İşçi yeniden başlatma,
IndexedDB açılışı sırasında hesap değişimi, gerçek işçi yazımından sonra yanıt
kaybı, sürmekte olan görsel taraması ve yazım sonrası çizim hatası ayrıca sınanır.

Bu test 96 MiB gerçek defter veya fiziksel dolu disk kurmaz; ilgili bütçe/kota
ölçümünü kontrollü enjekte eder. Gerçek iki motorlu sonuç dosyası oluşmadan
geçti sayılmaz. Service worker kurulumu/güncellemesi, 69 slaytlık gerçek ders
görsel kontrolü ve iPad kalem/avuç/kaydırma/bellek kabulü ayrıca yapılmalıdır.

## 7 Ekim 2026 — yerel aday sonuçları

Bu bölüm canlı yayın veya fiziksel cihaz kabulü değildir. İlk yerel adayın sürüm
etiketi v76 idi; bu ölçümler alındığında canlı v76 değiştirilmemiş, commit,
push ve dağıtım yapılmamıştı. Ardından onaylanan **v77** yayınının yeni
sürüm/PR/CI ve geri dönüş zinciri ayrı [RELEASE_V77](RELEASE_V77.md) belgesinde
tutulur. Aşağıdaki ilk aday ölçümleri yayın kanıtının yerine geçmez.

Ölçülen çizim kaynağı:
`55ca3b99a37b6419f714951bb15424581a50708daed97b6e5d626826e5eaa35f`.
Üretilmiş çerçeve HTML özeti:
`97579fbec1a3c9b4f475ea739cf08418e554bbb508b71ab7ca63696e5562d18f`.

| Kontrol | Sonuç | Yerel kanıt |
|---|---|---|
| Normal deftere aktarım ve kayıt güvenliği | İlk aday 70/70; sadeleştirme sonrası 86/86, aşağıdaki ek bölüme bakın | `outputs/pptx-notebook/results-all.json` |
| Eski ayrı sunum arşivi ve not akışı | 44/44; kaynak değişimi 0 | `outputs/pptx-v76-release/integration-all-synthetic.json` |
| Raster güvenlik/görsel sözleşmesi | 52/52; 50 sentetik kontrol ve 2 gerçek belge kontrolü | `outputs/pptx-v76-release/raster-probe/raster-contract-real69.json` |
| Gerçek 69 slayt, normal defter ve JSON dönüşü | Her iki motorda 5 aşama geçti; kaynak değişimi 0 | `outputs/pptx-notebook-real69/real69-notebook-{webkit,chromium}-97579fbec1a3.json` |

Üç kayıt güvenliği negatif kontrolünde yalnız bellekteki adaydan ilgili koruma
kaldırıldı: bekleyen görsel taraması testi yanlış başarıyı, yazım sonrası çizim
hatası testi yanlış hata türünü, kayıp işçi yanıtı testi iki kez yazmayı yakaladı.
Kaynak dosyaları değiştirilmedi. Ayrıca ana oturumun `verify-v76` komut sonucu
26 regresyon süitinin geçtiğini bildirdi; bu sayı yukarıdaki yeni testlere dahil
değildir ve ayrı bir birleştirilmiş JSON raporu üretilmemiştir.

Gerçek dosya yalnız okunarak kullanıldı; kaynak özeti
`955170ca7d7ca2093bdbf6871a764c29d2717df345be12b75fa065c607329ca7`.
Dosya 16.184.486 bayt ve 69 slayttır. Onaylı sentetik hesap ve yalnız yerel
sunucu kullanıldı. Harici istek/yükleme yoktu. Bu uçtan uca test özgün sunumu,
zemin resimlerini veya JSON yedeğini çıktı klasörüne kopyalamadı; JSON indirmesi
bellekte okunup geri yüklendi. Kanıtta yalnız sayılar, süreler ve özetler tutuldu.

| Gerçek dosya akışı | WebKit | Chromium |
|---|---:|---:|
| 69 slaytı hazırlama | 45,652 sn | 8,298 sn |
| Tek atomik kayıt | 2,507 sn | 0,566 sn |
| Tüm kabul akışı | 56,761 sn | 10,969 sn |
| Görüntü veri adreslerinin toplam karakteri | 15.387.936 | 16.187.871 |
| İndirilen JSON boyutu | 15.406.275 bayt | 16.206.210 bayt |

Her iki motorda önceki tek sayfa korundu; 69 yeni zeminle toplam 70 sayfa oluştu.
Bir `preservePrevious` yazımı yapıldı. Ana kalemle eklenen çizgi, JSON geri
yükleme ve uygulamanın yeniden açılması sonrasında korundu. İki görüntü bütçesi
de 24 MiB aktarım sınırının altındadır. Süreler eşzamanlı testlerin de çalıştığı
bilgisayardaki tek koşulardır; motor kıyaslaması veya iPad hız vaadi değildir.

Son raster kapısında her motorda 69 slaydın tamamı ve 71 resim kutusu yerel
renderer görünümüyle karşılaştırıldı. En yüksek kutu ortalama kanal hatası
Chromium'da 6,731/255, WebKit'te 6,788/255 altındaydı. WebKit'in önceki raster
yolunda fotoğrafların kaybolduğu durum giderildi; bu kontrol resimsiz bir
sunumu açmakla sınırlı değildir. Son rapor özeti:
`d8c879f8c0103aa4f39f4f1382ac8851c01f6e737e9e0d39d401a757a3e2121b`.
Desteklenmeyen çoklu `url(...)` içeren CSS görsel değerleri sessizce eksik
aktarılmaz; hazırlık reddedilir ve normal deftere hiçbir sayfa eklenmez.

### Ekleme akışının sadeleştirilmesi — yalnız yerel

Ana yol **Sunum seç → otomatik hazırlık → N slaytı ekle** oldu. Dosya adı,
ilerleme, hedef defter ve mevcut sayfaların korunacağı aynı pencerede gösterilir.
Eski sunum/yedek yolları ve teknik bilgiler katlanır bölümlerdedir. Ekle
menüsünde beş ana seçenek görünür; eski okuyucu ve sunucu dönüştürmesi
**Diğer sunum seçenekleri** altındadır. Çizim ve kalıcı kayıt motoru bu arayüz
düzenlemesinde değiştirilmedi.

- Son notebook testi **86/86**: önceki 70 kontrol korundu, iki motorda toplam
  16 akış kontrolü eklendi. Eski sunum/çevrimdışı regresyonu **44/44** geçti.
  İki raporda kaynak sapması sıfırdır.
- Dosya seçimi, hazır/ilerleme/hata/iptal, dosya adı enjeksiyonu, yeni defter
  hedefi ve 390×480 görünüm sınandı. Masaüstü ve dar ekran görüntüleri
  `outputs/pptx-notebook/` altında tutulur; gerçek iPad kabulü değildir.
- Bağımsız klavye/odak/Escape senaryoları iki motorda **4/4** geçti. Ayrı
  `stale-ready` hata enjeksiyonunda WebKit yazımı engelledi fakat hazır düğmesi
  açıklamasız kaldı; bu eski davranışın gerçek kullanıcı yoluyla tetiklendiği
  doğrulanmadı. Aynı ek Chromium denemesi dosya seçici hazırlığında zaman
  aşımına uğradı; başarı sayılmadı. Rapor:
  `outputs/pptx-ui-review/keyboard-results.json`.
- Yeniden hazırlanan 243 dosyalık manifestin özeti
  `5d4277b3c88e71f3212b07616d30810eb4574a5dec15f4489488fe6521d1cb6d`.
  8780 yerel önizlemesinin iki değişen betiği kaynakla birebir eşleşti; iki
  tarayıcıdaki menü/açılış/iptal kontrolünde JavaScript hatası veya harici istek
  olmadı. Kullanıcının tarayıcı profiline ve notlarına dokunulmadı.
- Yukarıdaki 52 raster ve gerçek 69 slayt sonuçları önceki yerel adayın
  ölçümleridir; bu metin/yerleşim değişikliği için yeniden koşturulmadı.
  Commit, push ve canlı yayın yapılmadı.

### Açık kabul sınırları

- Fiziksel iPad'de kalem, avuç reddi, iki parmak kaydırma, bellek baskısı ve
  arka plandan dönüş henüz kabul edilmedi.
- Yerel renderer ile raster arasında görsel karşılaştırma, Microsoft PowerPoint
  ile font ve yerleşimin birebir aynı olduğunu kanıtlamaz. Özgün dosyayla insan
  kontrolü sürdürülmelidir.
- Bu yeni aktarımın canlı sürüme alınması, dağıtım/geri dönüş kanıtı ve gerçek
  cihazda güncelleme ayrı aşamalardır. Mevcut notlar için JSON yedeği alınmalıdır.
- "Kaydedildi ancak ekran yenilenemedi" veya kesin sonuç alınamadı mesajında
  hemen tekrar eklemeyin; defteri yeniden açıp sayfaları kontrol edin.
- Dosya 20 MiB'dan küçük olsa da hazırlanmış görüntüler 24 MiB'ı aşabilir. Böyle
  bir dosyayı bölmek gerekir; test edilen 69 slayt tüm sunumlara garanti değildir.
