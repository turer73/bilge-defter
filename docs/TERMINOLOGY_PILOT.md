# Üç dilli anatomi sözlüğü — yerel pilot

## Kapsam ve doğruluk sınırı

100 bağımsız hazırlanmış taslak kavram: Türkçe, İngilizce ve Latince etiketler,
eş adlar, kısaltmalar, kategori ve belirsizlik notları. Uzman onaylı kavram: **0**.
Bu bir FIPAT yayını/çevirisi, TDK çevirisi veya doğrulanmış tıp sözlüğü değildir.
FIPAT TA2 yalnız kaynak **adayıdır**: her satırın standart kimliği, doğru bölümü
ve eşleştirmesi henüz kontrol edilmedi. `verifiedSources` bilinçli olarak boştur.
Yanlış olabilecek taslaklar ders kaynağı olarak yayınlanmadan önce gözden geçirilmelidir.

## Kullanım

Sözlük > Arama alanı > Anatomi terimleri · pilot.
Kalp / heart / cor aynı kavramı bulur. Türkçe karaktersiz giriş desteklenir.
Yakın yazımlar öneri olarak gösterilir; giriş ve defter metni değişmez.
Femur gibi çok anlamlı etiketler birleştirilmez. Kısaltmalar bağlama bağlıdır.
Arama için seç yalnız yerel taslak oluşturur, notlara yazmaz, internete göndermez.
Web’de ara önceki davranışı korur: yalnız özgün giriş açık düğme eylemiyle gönderilir.
Kaynaklarda çok dilli soru araması, otomatik çeviri ve OCR düzeltmesi kapsam dışıdır.

## Veri sözleşmesi

`id` kalıcı kavram kimliğidir; etiket değişince kimlik değişmez. `labels.tr/en/la`
dil karşılıklarını, `aliases` eş adları, `abbreviations` bağlama bağlı kısaltmaları
tutar. Latince zorunlu değildir; motor null karşılığı üretmez veya tahmin etmez.
`reviewStatus`, `referenceCandidates`, `verifiedSources` birbirinden ayrıdır.
Bu pilot yalnız taslak kayıtları kabul eder; onay iş akışı ve kayıt başına
inceleyen/tarih/standart kimlik bilgisi ikinci veri sürümünden önce eklenmelidir.

Motor tam eşleşmeyi önce, Türkçe karakter sadeleştirmesini ikinci sırada kullanır.
Yazım önerisi yalnız normal sonuç yokken, sınırlı uzunluk ve düzenleme mesafesiyle
çalışır. Uzun doğal dil sorularını kavramlara ayırdığı iddia edilmez.
Sorgu genişletme taslağı özgün girişi ayrı korur ve onay gerektirir.

## Kaynaklar ve haklar

- FIPAT TA2 ön bölüm: https://fipat.library.dal.ca/wp-content/uploads/2021/08/FIPAT-TA2-Front-Matter.pdf
  Tekil terimler kamu malı; yayın CC BY-ND 4.0. Yayının toplu çevirisi içeri alınmadı.
- MeSH sonraki biyomedikal eşleme için aday; bu pilotta MeSH ithalatı yok.
  https://www.nlm.nih.gov/databases/download/mesh.html
- Mevcut Türkçe TDK alt kümesi aynen korundu. Depo kodunun MIT olması TDK verisinin
  yeniden dağıtım hakkını tek başına doğrulamaz; içerik hakkı incelemesi hâlâ açık.

## İlk yerel çalışmanın test ve yayın sınırı (24 Eylül)

`npm run build` yerel v53 adayını üretir; `npm run test:terminology` önce adayı yeniden
üretir, ardından veri/motor ve Chromium/WebKit ekran testlerini çalıştırır.
WebKit testi fiziksel iPad testi değildir. `npm test` mevcut sürüm regresyonlarını
ve yeni sözlük testlerini birlikte çalıştırır. Playwright tarayıcıları kurulu olmalıdır.
Canlı sürüm, hizmet çalışanı sürüm etiketi, sunucu API'si ve öğrenci verileri bu işte
değiştirilmez. Bu dosyalar mevcut **yerel** v53 adayına eklenmiştir; daha önce
sahnelendiği bildirilen v53 paketinin byte/hash değerleriyle artık aynı sayılmaz.
Yeni yayın onayı öncesinde sürümleme, paket bütünlüğü ve gerçek güncelleme akışı yeniden
doğrulanmalıdır; aynı sürüm etiketiyle değişmiş dosyalar canlıya kopyalanmamalıdır.

Sonraki kabul: 100 kaydın uzman/kaynak incelemesi; yanlış/eksik Latin alanlarının
ayıklanması; gerçek cihazda çevrim dışı açılış; kaynaklarda arama için kullanıcının
onayladığı karşılıkların özgün soruyla birlikte kullanılması.

## Yerel doğrulama — 24 Eylül 2026

- 24 veri/motor kontrolü geçti; bunların içinde 100 kavram × 3 dil = 300 etiket
  geri bulma denemesi var. Bunlar kaynak doğruluğu veya uzman incelemesi değildir.
- Chromium ve WebKit'te 820×1180 ve 390×844 boyutlarında 40 arayüz kontrolü geçti.
  Arayüz testlerinde sunucu cevapları sentetik; dış istekler engellendi.
- 238 mevcut regresyon kontrolü geçti: 102 backend, 31 tablet, 29 veri koruma,
  13 hesap, 8 öğrenci listesi, 10 tema, 6 güncelleme, 14 giriş, 9 kalem/kayıt
  performansı ve 16 PDF istemci kontrolü. PDF testleri gerçek sunucu kabulü değildir.
- 234 çevrim dışı varlığın hash'i ve 20 betiğin sözdizimi doğrulandı.
- Son yerel paket SHA256SUMS hash'i:
  `b224d8b0fdb983ab9d06da027258f918f59db69cb0b46e1b4a786b60dfaa2759`.
- Node 24.13.0, Playwright 1.62.1 kullanıldı; bu sürüm package.json ile aynı.
  node_modules yoktu: paketlenmiş çalışma zamanı NODE_PATH ile kullanıldı.
  Eksik WebKit 26.5 test tarayıcısı (build 2336) indirildi.
- İlk görsel kontrolde global display kuralının gizli sözlük seçicisini görünür
  bıraktığı bulundu; kapsamlı hidden kuralı ve görünürlük testiyle düzeltildi.
- Windows dosya-yama yardımcı hatası nedeniyle aynı apply_patch aracı doğrudan
  çalıştırıldı. İlk tarayıcı koşusu eksik modül/WebKit nedeniyle tamamlanmamıştı;
  bağımlılıklar bulunup WebKit kurulduktan sonraki iki motorlu koşu başarılıdır.
- Ekran görüntüleri: outputs/terminology-pilot/. Fiziksel iPad/sınıf kabulü yok.
  Commit, push, yayın, sunucu verisi veya öğrenci defteri değişikliği yapılmadı.

## Onaylı canlı sözlük pilotu — v54, 25 Eylül 2026

Kullanıcının canlı yayın onayıyla v54 yalnız web paketi olarak yayınlandı.
Yerel v53 adayının tamamı yayınlanmadı: canlı v52 git kaydı
`d426df9cfbb8a97955183bdc606b586b191c3edf` aynen yeniden kuruldu, sadece
sözlük pilotu ve sürüm dosyaları üzerine eklendi. 230 mevcut dosya byte-byte aynı.
v53 PDF sunucu özelliği bu pakete alınmadı; ayrı PDF test ortamı korunuyor.

- Canlı adres: https://defter.bilgearena.com/ — origin sürümü v54.
- Paket: `/opt/bilge-defter-classroom-v54/ui`; 237 HTTP dosyası,
  234 çevrim dışı varlık. Tümü hem önizlemede hem canlı origin üzerinde hash ile doğrulandı.
- SHA256SUMS: `be5f789bc33c6d57c443c4c3d77642a31a15c4274212f589e37dfdacbb42b740`.
- Yapılandırma: `8d3ca55ba9fe6282c114e28c3558b800c4e368833ecf2f0d72ae6a6e1c2a68f1`.
  v52 yapılandırmasına yalnız iki sözlük JS dosyasının izin yolu eklendi.
- 286 yerel otomatik kontrol geçti: 199 mevcut temel regresyon, 14 giriş,
  24 sözlük motoru, 40 Chromium/WebKit arayüz ve 9 kalem/kayıt performansı.
  v52 -> v54 hizmet çalışanı güncellemesi sentetik notlarla denetlendi.
- İki kimliksiz API isteği 401, beş özel yol 404 döndü.
  Dış HTTPS isteği Cloudflare Access girişine 302 döndü; giriş koruması kaldırılmadı.
- Hesap servisi v50, veritabanı, kullanıcılar, Cloudflare, linux-ai-server ve
  diğer konteynerler değiştirilmedi. Diğer konteyner kimlik/başlangıç/durumları
  ve linux-ai-server işlem kimliği yayın öncesi kayıtla aynı kaldı.
- Eski web konteyneri `bilge-defter-invited-web-rollback-v54` adıyla durdurulmuş
  halde ve v52 dosyalarıyla korunuyor. Geri dönüş:
  `python3 /opt/bilge-defter-classroom-v54/deploy-classroom-v54.py rollback`.
- İlk önizleme Docker hata metninin küçük harf olması nedeniyle durdu; kontrol
  düzeltildi. İlk geçiş kök dizinin bağlantı değiştirme izninde durdu; v52 tekrar
  başlatıldı ve doğrulandı. Yalnız sabit bağlantı değiştirme adımına sudo eklendi;
  dizin izinleri genişletilmedi. İkinci geçiş başarılı. İlk başarısız v54 web
  konteyneri durdurulmuş halde saklanıyor, not/veri silinmedi.
- Kanıtlar: `outputs/v54/`; sunucuda build-receipt.json, before.json,
  preview-receipt.json, origin-receipt.json. Betikler work/ altında.
- Commit/push yapılmadı. Fiziksel iPad, davetli oturum ve sınıf kabulü kullanıcı
  testi bekliyor; WebKit emülasyonu gerçek iPad kabulü değildir.

100 kavramın tamamı hâlâ taslak, uzman onaylı kayıt sayısı **0**. Kaynak adayları
doğrulanmış karşılık gibi sunulmuyor. Notlar otomatik değiştirilmez, sorgu taslağı
kullanıcı seçimi olmadan dış servise gönderilmez. Test: Çalışma > Sözlük >
Anatomi terimleri - pilot; kalp/heart/cor, on capraz bag, kallp ve femur aramaları.

## Yerel sözlük/arama düzeltmeleri — 25 Eylül 2026, yayımlanmadı

Kullanıcı bu dosya kapsamı için Codex uygulama istisnası verdi. Yeni kaynak
kütüphanesi veya çeviri servisi kurulmadı. Kaynak verideki 100 kavram hâlâ taslak;
bu düzeltme terimlerin doğruluğunu onaylamaz.

Doğrulanan ve düzeltilen durumlar:

- Yeni sorgu yazılınca 250 ms bekleme sırasında eski sonuçlar seçilebilir
  kalıyordu. Sonuçlar artık hemen temizlenir, bekleme durumu gösterilir.
- Önceki sorguya veya kapanmış pencereye ait seçim olayı eski arama taslağını
  yeniden oluşturabiliyordu. Seçim güncel sorgu, arama kimliği, açık pencere ve
  doğru sözlük modu ile eşleşmek zorundadır.
- Sunucu hatasından sonra yeniden başarılı aramada açıklama cihazdaki alt
  kümeyi göstermeye devam ediyordu. Başarılı cevaptan sonra açıklama da düzelir.

Kanıt ve tekrar:

- Yeni `work/verify-dictionary-search.cjs` ilk koşuda Chromium/WebKit toplam
  10 testten 8'inde bu hataları gösterdi; mevcut geç yanıt koruması 2/2 geçti.
  Düzeltmeden sonra eklenen olumlu seçim/Web arama kontrolüyle **12/12** geçti.
- `npm run test:dictionary-search` bu 12 kontrolü tek başına çalıştırır;
  `npm test` ve `npm run test:terminology` zincirlerine de eklendi.
- Mevcut v54 yerel paketi değiştirilmeden, yalnız düzeltilen sözlük dosyası
  testte kullanıldı: Chromium/WebKit 820x1180 ve 390x844 boyutlarında **40/40**
  kontrol geçti. Sunucu cevapları sentetik; dış ağ engelli, kullanıcı profili yok.
- İki WebKit ekran görüntüsü görsel incelendi; sözlük penceresi ve düğmeler
  görüntü alanı içinde. Kanıtlar: `outputs/dictionary-search-20260925/`.
- Aynı turda 24 sözlük motoru, 38 çeviri denetim/çalıştırıcı, 8 OCR değerlendirme
  ve 7 sentetik yedek/göç kontrolü geçti. Toplam **129 yerel kontrol**;
  bu tüm uygulama testlerinin yeniden çalıştırıldığı anlamına gelmez.

Tam uygulama ekran testini paket değiştirmeden tekrar çalıştırmak için:

```powershell
$env:BILGE_TEST_ROOT='D:\Projelerim\bilge-defter\work\bilge-defter-invited-v54'
$env:BILGE_TEST_DICTIONARY_SOURCE='D:\Projelerim\bilge-defter\work\bilge-defter-test\dictionary-workspace.js'
$env:BILGE_TEST_OUTPUT='D:\Projelerim\bilge-defter\outputs\dictionary-search-new-run'
node work/verify-terminology-ui.cjs
```

Kurulu Playwright 1.62.1 ve Chromium/WebKit gerekir; bu tur paketlenmiş Node
modülleri NODE_PATH ile kullanıldı. Testte hizmet çalışanı kapalıdır: gerçek
PWA güncellemesi, fiziksel iPad ve kimlikli canlı kabul bu testin kapsamı değil.

Kaynak `dictionary-workspace.js` değişti; tarihsel v54 paketi, sürüm etiketi ve
manifestleri değiştirilmedi. Bu bir hazır yayın paketi değildir. Gelecek yayın
için yeni sürümle paketleme, manifest/hash, güncelleme ve kabul denetimi gerekir;
aynı v54 sürümüne dosya kopyalanmamalı. Commit/push, canlı yayın, sunucu ayarı,
öğrenci verisi veya yeni model çağrısı yapılmadı.
