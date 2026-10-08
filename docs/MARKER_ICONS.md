# Fosforlu kalem ve arayüz ikonları

7 Ekim 2026 — yerel geliştirme; commit, push veya canlı yayın değildir.

## Kapsam

Kullanıcı "vurgu renkleri" ile buton temasını değil, fosforlu kalem mürekkebini
kastettiğini belirtti. Buton temaları, kayıtlı renk tercihleri ve marka/PWA
logoları değiştirilmedi.

- Yeni fosforlu çizgiler yüzde 40 opaklıkla oluşturulur. Daha önce kaydedilmiş,
  opaklık alanı olmayan çizgiler yüzde 25 olarak kalır; toplu göç yapılmaz.
- Sarı, yeşil, mavi, pembe, turuncu ve mor içeren ayrı fosforlu palet vardır.
  Kalemin mevcut paleti ve araç başına renk ayrımı korunur.
- Kalınlık önizlemesi fosforlunun 2,5 kat çizgi genişliğini ve yeni opaklığını
  gösterir. Renk ve kalınlık seçimi yalnız sonraki çizgilere uygulanır.
- 39 arayüz ikonu Tabler Icons v3.49.0 geometrileriyle değiştirildi. PowerPoint
  için ayrı sunum ikonu kullanılır. Mevcut buton adları ve komutları korunur.

## Kayıt ve çizim sözleşmesi

Yeni fosforlu çizgi isteğe bağlı `markerOpacity: 0.4` alanı taşır. Alan yalnız
`marker` aracında, sonlu 0,1–0,6 aralığında kabul edilir. Eski, alanı olmayan
çizgiler geçerlidir. Tam çizim ve artımlı çizim aynı `markerAlpha` yardımcısını
kullanır; PDF dışa aktarımı ve slayt önbelleği de ortak çizici üzerinden geçer.

Gerçek eski v76 okuyucusuyla kayıt/yedek uyumluluğu sınanır. Eski okuyucu yeni
alanı reddetmez ama **yeni vurguyu yine yüzde 25 gösterir**; geri dönüşte veri
okunabilirliği, görünümün aynı kalacağı anlamına gelmez. Defter sürümü ve varlık
depolama biçimi değişmez.

Artımlı çizimde aynı çizginin birleşen saydam parçaları üst üste binebilir;
mevcut çok parçalı çizim algoritması bu çalışmada değiştirilmedi. Testin tam ve
artımlı görüntü eşitliği iddiası tek temas ve üst üste binmeyen iç bölgeyle
sınırlıdır; karmaşık bütün çizgilerin bit düzeyinde eşitliği iddia edilmez.

## İkon kaynağı

- Sabit sürüm: https://github.com/tabler/tabler-icons/releases/tag/v3.49.0
- Kaynak dizini: https://github.com/tabler/tabler-icons/tree/v3.49.0/icons/outline
- Lisans: MIT; tam metin `work/bilge-defter-test/THIRD_PARTY.md` ve ikon
  tablosunun kaynak yorumunda bulunur.
- Yalnız kullanılan 39 SVG'nin geometrisi yerelde gömülüdür. Yeni CDN, font,
  çalışma zamanı bağımlılığı veya ağ isteği yoktur. Stroke 2 yerine 1,8'dir.
- SVG'ler dekoratiftir (`aria-hidden`, `focusable=false`); erişilebilir eylem adı
  butonda kalır. Bu kontrol tam erişilebilirlik denetimi değildir.

## Yerel testler

Yeni hedefli süit: `node work/verify-marker-icons.cjs`. İzole tarayıcı profili,
sentetik hesap ve sentetik çizgiler kullanır; kullanıcı notlarını okumaz.
Chromium/WebKit sonuçları ve ekran görüntüleri `outputs/marker-icons/` altına
yazılır. Opaklık, gerçek pointer yolu, doğrulama, kayıt/yeniden açma, JSON
yedek/geri yükleme, PDF çıktısı, araç rengi ayrımı, ikonlar ve 390/820/1180 px
menü yerleşimleri kontrol edilir.

Sonuç: **18/18 geçti** (Chromium 9, WebKit 9), kaynak sapması yok. İlk koşudaki
14/18 sonuç ayrıca `initial-harness-report.json` olarak saklandı: dört hata,
iki motorda testin yayımlanmamış doğrudan araç çağrısını kullanması ve eski
slotted SVG'leri yeni ikonlarla karıştırmasından kaynaklanıyordu. Gerçek köprü
komutu ve UI shadowRoot kapsamı düzeltildi; uygulama bu hatalar için değişmedi.

Fosforluya özel PDF kontrolü, gerçek dışa aktarım akışındaki JPEG öncesi tuval
piksellerini ve indirilen dosyanın PDF başlığını doğrular; son PDF'nin piksel
sadakatini kanıtlamaz. Ayrı mevcut tablet süitinde PDF gerçek okuyucuyla yeniden
açılır. Bu iki kontrolün kapsamları birbirinin yerine geçmez.

Bu değişiklikle yeniden geçen mevcut kontroller:

- `node work/verify-slide-flow.cjs`: 40/40, kaynak sapması yok.
- `node work/verify-pptx-notebook-compat.cjs`: 14/14, kaynak sapması yok.
- `node work/verify-v77.cjs verify-v63-ink.cjs`: 8/8.
- `node work/verify-v77.cjs verify-v57-ink.cjs`: 32 assertion.
- `node work/verify-v77.cjs verify-v50-tablet.cjs`: başarılı.

Önceki turda yapılan tam 26 süitlik regresyon bu yeni değişiklikle baştan
koşturulmadı; yukarıdaki ilgili süitler yeniden çalıştırıldı. Gerçek iPad/Pencil
testi yapılmadı. `SLIDE_FLOW.md` içindeki yoğun DPR 2 kenar-yumuşatma farkı kapısı
bu ikon/fosforlu değişikliğiyle kapanmış sayılmaz.

## Önizleme ve sınırlar

Adres: http://127.0.0.1:8780/?preview=notebook

Önizleme yalnız loopback üzerinde ve sentetik yerel hesapla çalışır; canlı hesaba
bağlı değildir. Mevcut önizleme notları silinmez. Açık sekme otomatik yenilenmez;
"Bu cihazda kaydedildi" durumunu gördükten sonra kullanıcı yenileyebilir.
Yerel dosya doğrulaması fiziksel cihaz kabulü veya canlı yayın kanıtı değildir.

243 dosyanın tamamı yerel çevrimdışı manifest hash'leriyle eşleşti. Önizleme
yalnız `127.0.0.1:8780` üzerinde dinler; HTTP'den alınan yeni UI betiği kaynakla
eşleşir. Kaynak referansı: mevcut HEAD `a441a2d3e1cb2fce7afcd592f7ca5d1480fe9e05`
üzerindeki commit edilmemiş yerel aday.
