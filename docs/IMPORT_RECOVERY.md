# Belirsiz sunum kaydından güvenli dönüş

## Kapsam

11 Ekim 2026 yerel aday; claim #102665, discovery #2407. Canlı yayın, sürüm
artışı, veri göçü veya dosya/sayfa sınırı değişikliği değildir.

Sunum kaydı tamamlanıp yanıtı kaybolabilir. Diskte yeni sayfalar bulunurken
ekrandaki defter eski kalabilir. Önceki davranışta `uncertain` penceresini
kapatmak yeniden yazmayı açıyordu; sonraki kalem/otomatik kayıt başarılı
aktarımı eski defterle değiştirebiliyordu.

`outputs/import-recovery-20261011/negative-before-r1/results.json` bu davranışı
Chromium ve WebKit'te yeniden üretir: gerçek iki slayt aktarımı diskte üç
sayfayken, başarılı `dbPut` sonrası kayıp yanıt enjeksiyonu ve pencereyi
kapatma sonrası kayıt diski bir sayfaya düşürür. Ayrı kayıt-sonrası
`renderPages` hatası da kurtarma yapılmadan yeni yazıma izin veriyordu.
Bu deney gerçek işletim sistemi çökmesi veya fiziksel iPad kabulü değildir.

## Yeni davranış

- `BilgeRasterImport.commit`, `ImportCommitUnknown`, kayıt işçisinin kesin
  sonuç vermemesi veya kayıt-sonrası ekran hatasında aynı hesap için yazma
  karantinasını etkinleştirir.
- Mevcut `saveConflict` yazma engeli kullanılır ancak kullanıcıya başka
  sekme hatası gösterilmez. Sunum kaydını kontrol etmek için defterin yeniden
  açılması istenir. Otomatik yeniden deneme ve ilgili kayıt zamanlayıcıları
  durur. Modalı kapatmak bu engeli kaldırmaz.
- Normal kalem, sıraya alınmış kayıt ve yaşam döngüsü kaydı durur. `dbPut`
  girişinde, worker gönderim kontrolünde ve sayfa üzerindeki IDB yazıcısında
  da karantina kontrol edilir. Böylece yalnız arayüz kilidine güvenilmez.
- Yeni eşitleme, mevcut düzenleyici/kayıt engelleri nedeniyle başlamaz.
  Daha önce şifrelemeye başlayan gönderim son POST sınırında tekrar
  kontrol edilir. Hesap doğrulamasını bekleyen gönderimin iptal sinyali de
  aynı kapsamın karantinasına bağlıdır; doğrulama dönünce eski POST gönderilmez.
  Önceden açılmış sayfa-üzeri IDB işlemi, son metadata okumasından sonra da
  kontrol edilir ve karantina oluşmuşsa yazmadan iptal edilir.
  Yerel eşitleme alındısı da girişte ve işlem içinde kontrol
  edilir; belirsiz durum başarıyla eşitlenmiş gibi işaretlenmez.
- Kontrol yalnız ilgili DB kapsamına aittir; başka hesaptan geç gelen sonuç
  mevcut hesabı karantinaya almaz. Sayfa yeniden yüklenmeden engel kalkmaz.
- Kayıtlı defter ve `before-import` kopyası karantina tarafından değiştirilmez.
  “Bu sekmenin yedeğini al” çalışmaya devam eder; bu yedek eski ekrandaki
  defterdir ve son slaytları içermeyebilir. Kullanıcıya bu sınır gösterilir.

## Kullanıcı yolu

Sunumu hemen yeniden eklemeyin. Hata penceresini kapatıp “Kayıtlı defteri
yeniden aç” düğmesini kullanın. Gerekirse önce bu sekmenin JSON yedeğini alın.
Yeniden açıldıktan sonra slaytların bulunup bulunmadığını kontrol edin.
Uygulama depolamasını veya tarayıcı verilerini silmeyin.

## Sınırlar

Karantina öncesinde gönderilmiş ağ isteği geri alınmış sayılmaz. Karantina
sonrasında yeni POST gönderimini ve yerel alındı yazımını engellemek,
önceden sunucuya ulaşmış içeriği geri alma garantisi değildir.

Geçici slayt deposu ve kalıcı defter/asset şeması değişmedi. Son aktarım hâlâ
tüm kodlanmış slayt görsellerini belleğe alır. Bu yama RAM veya hız kazanımı
iddiası taşımaz; toplu JSON/kopyalama maliyeti iyileştirmesinden önceki
veri güvenliği adımıdır. Seçilmiş otomasyon testleri fiziksel iPad, gerçek
Apple Pencil, gerçek işçi/OS çökmesi veya tam CI yerine geçmez.

Tam bu adayın ölçümleri, kaynak hash'leri, negatif kontroller ve kapsam
sınırları `outputs/import-recovery-20261011/REPORT.md` ve `PROOF.json`
dosyalarında tutulur. Önceki kanıt dosyaları değiştirilmez.

`npm run test:pptx-staging` aktarım regresyonlarını ve
`test:import-recovery-sync` sınır testlerini birlikte çalıştırır. İkincisi
gerçek içe aktarıcı hatasını taklit etmez; karantina girişini deterministik
şifreleme/hesap doğrulaması/IDB bekleme noktalarında doğrudan tetikleyerek
alt sınırları ayırır. Gerçek içe aktarıcı-hata-yeniden-açma zinciri ilk süittedir.
