# v62 — anatomi sözlüğü 100 → 356 kavram

Kullanıcı 27 Eylül 2026'da anatomi terimleri sözlüğünü kütüphanedeki kitaplar ve açık lisanslı
bir sözlükle geliştirmeyi, kas kategorisini de ayrıca gözden geçirip genişletmeyi istedi
(claim 101532).

## Kaynaklar ve seçim

- **Wikidata (CC0).** Uluslararası anatomi terim koduna (TA98/TA2) bağlı, Türkçe etiketli 705
  öğe 26 Eylül'de; kas bölümünden (TA98 A04) İngilizce etiketli 618 öğe 27 Eylül'de indirildi.
  Sorgular, ham sonuçlar ve SHA-256 alındıları `work/terminology/` içinde.
- **Kitaplar.** Kütüphanedeki 5 açık lisanslı kitabın sayfa dizinlerinde (her biri kendi
  alındısındaki hash ile doğrulanarak) yalnız sayfa sayıları tutuldu; kitap metni kopyalanmadı.
- **Aday seçimi.** Pilotta olmayan, Latince etiketi olan ve kitaplarda en az 5 sayfada geçen
  212 öğe. `build-terminology.cjs` bu listeyi anlık görüntüden yeniden üretir ve inceleme
  listesiyle birebir karşılaştırır.
- **Editör incelemesi** (`review-v62.txt`): 204 kabul, 8 ret (tekrar, belirsiz anlam, TA kodu
  ile etiketin uyuşmaması, doğrulanamayan Latince). Wikidata'nın Türkçe tarafı gürültülü çıktı:
  femoral atardamar "femoral sinir", sinovyal zar "sinovit", talus "topuk", ksifoid çıkıntı
  "xiphoid işlemi"; argo eş anlamlılar ve Arapça yazılı bir etiket de vardı. Bunlar düzeltildi
  ya da alınmadı.
- **Kaslar** (`review-v62-muscles.txt`): kitaplar kas adlarını az geçirdiği için sayfa eşiği
  uygulanmadı; derslerde öğretilen 52 iskelet kası editörce seçildi. İngilizce ve Latince
  Wikidata'dan; Türkçe ad 44 kasta Wikidata'da yoktu ve editörce yazıldı, 8'inde düzeltildi.
  Emin olunmayan yerde uydurma Türkçe yerine yerleşik Latince kökenli ad kullanıldı
  (buksinatör kası, fleksör karpi radialis kası). Kas kategorisi 15 → 75.
- Aday süzgecinde "temporal muscle", pilottaki "temporal bone" ile yanlışlıkla aynı sayılmıştı;
  kas incelemesinde eklendi.

Her kavramda `labelSource`: Wikidata öğesi, TA kodu, `edited` (Wikidata'da olan ve editörün
değiştirdiği etiketler) ve `added` (Wikidata'da olmayan, editörün yazdığı etiketler). 256 yeni
kavramın 123'ünde düzeltme, 44'ünde Türkçe ekleme var. İlk 100 pilot kavramın etiketlerine
dokunulmadı. Hepsi taslaktır; **uzman incelemesi yapılmadı.**

## Uygulamada

- Kavram kartında: "Etiket kaynağı: Wikidata Q… · TA98 … (CC0)" bağlantısı ve varsa
  "editör düzeltmesi" / "editör eklemesi"; "Kütüphane araması “…”: N kitapta M sayfa
  eşleşiyor · en çok: …". Sayı kütüphane aramasının eşleştirdiği sayfadır (terimin bütün
  kelimeleri sayfada); terimin o sayfalarda ifade olarak geçtiği iddia edilmez.
- **Kütüphanede ara düzeltmesi.** Her kavram için İngilizce etiket ve eş anlamlılar arasından
  kütüphanede en çok sayfa bulan terim gönderilir. Önceden "yemek borusu" İngiliz yazımıyla
  (oesophagus) aranıyor ve hiç sonuç vermiyordu; şimdi "esophagus" (85 sayfa). Kitapların
  "Appendix" bölümleriyle karışmasın diye apandis için tam ad aranır.
- Latince "os" iki anlamıyla (ağız, kemik) notlu olarak ayrı kalır; "kaş" ve "kas" tam
  eşleşmeyle ayrılır.

Kütüphane, hesap servisi, veritabanları, nginx izin listesi, dosya sayısı ve Access/DNS
değişmez. `work/terminology/**` Git'te `-text`: hash'li girdiler satır sonu dönüşümüne uğramaz.

## Yerel doğrulama

- `verify-terminology.cjs` **46 kontrol**: üretilen blok sabit girdilerin birebir çıktısı
  (etiket bozulunca başarısız olduğu negatif kontrolle görüldü); 356 kavram, hepsi taslak,
  `verifiedSources` boş; 3 × 356 etiketin her biri kendi kavramını buluyor; argo ve yanlış
  Wikidata etiketleri yok; yalnız platisma ve tensor fasciae latae kütüphanede eşleşmiyor.
- `verify-v62-dictionary.cjs`, Chromium ve WebKit, 390 ve 1180 px, **24 kontrol**: kaynak
  bağlantısı ve TA kodu, düzeltme/ekleme ayrımı, kütüphane satırı, "Kütüphanede ara"nın
  "esophagus" göndermesi, taşma yok, defter değişmiyor, dış istek yok.
- `npm test`: 16 suite geçti (188 s); v51, v52, v56–v61 temel paketleri Git'ten sabit hash'lerle yeniden
  üretildi (v61 = canlıdaki 20bcf136). Paket `SHA256SUMS` 3592843a…; dosya sayısı değişmedi (238/235).
- Fiziksel iPad ve gerçek hesap testi yapılmadı.

## Yayın

Kullanıcı onayıyla 27 Eylül 2026'da canlıya alındı (kaynak `5240bf0`, paket `SHA256SUMS`
3592843a…, payload 0e9bac7c…, nginx 3f3ef2ae… v61 ile aynı).

- `stage` ve `activate`: 238 HTTP hash, 235 çevrim dışı dosya, 14 yetkisiz istek reddi, 6 özel
  yol kapalı; kütüphane `v58/library` kodunda ve sağlıklı; hesaplar ve diğer servisler değişmedi.
- Bağımsız kontrol: canlı `release.json` = v62; `terminology-data.js`, `terminology.js`,
  `dictionary-workspace.js`, `sw.js`, `index.html` baytları Git'teki `5240bf0` ile aynı; `verify`
  yeniden geçti; `-preview-v62` kapalı, v61 web konteyneri `-rollback-v62` adıyla durdurulmuş.

Geri dönüş (yalnız v62 etkin sürümken):

```sh
sudo python3 /opt/bilge-defter-classroom-v62/deploy-v62.py rollback
```
