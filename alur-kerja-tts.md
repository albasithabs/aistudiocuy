# Alur Kerja Fitur Text-to-Speech (TTS) / Voice Over

Alurnya bisa dibagi menjadi tiga tahap utama: Perintah dari Pengguna, Proses oleh AI, dan Konversi & Hasil.

## Tahap 1: Perintah dari Pengguna (Client-Side)

Ini adalah apa yang terjadi di browser Anda saat Anda berinteraksi dengan antarmuka.

1.  **Aksi Klik**: Anda menekan tombol **Putar (▶️)** atau **Unduh (📥)** pada salah satu kartu scene.

2.  **Pengumpulan Data**: Aplikasi langsung mengambil dua informasi penting:
    *   **Naskah**: Teks yang ada di dalam kotak "VO Script" dari scene yang Anda klik.
    *   **Aktor Suara**: Pilihan "Voice Actor" yang telah Anda atur di panel form (misalnya, "Zephyr", "Puck", "Talon", "Kore", "Polly", atau "Lyra").

3.  **Penyusunan Perintah untuk AI**: Aplikasi menyusun permintaan ke API, mengirimkan naskah dan nama aktor suara yang dipilih untuk diproses.

## Tahap 2: Proses oleh AI (Server-Side Google)

Perintah yang sudah disusun tadi kemudian dikirim melalui internet ke server Google.

1.  **Panggilan API**: Aplikasi melakukan panggilan ke model AI khusus suara, yaitu `gemini-2.5-flash-preview-tts`.

2.  **Generasi Suara**: Di server Google, model AI melakukan dua hal:
    *   Membaca dan memahami naskah Anda.
    *   Menghasilkan gelombang suara (audio) sambil menerapkan karakteristik suara dari "Voice Actor" yang Anda perintahkan.

3.  **Pengiriman Kembali**: AI tidak mengirim file `.mp3` atau `.wav` biasa. Ia mengirimkan data audio mentah (dalam format PCM) yang telah di-encode menjadi teks **Base64** agar mudah ditransfer kembali ke aplikasi Anda.

## Tahap 3: Konversi & Hasil (Kembali di Client-Side)

Data mentah dari Google sudah tiba kembali di browser Anda. Sekarang, aplikasi harus membuatnya bisa digunakan.

1.  **Decoding**: Aplikasi mengubah kembali teks Base64 menjadi data audio mentah.

2.  **"Pembungkusan" menjadi File .wav**: Data audio mentah ini seperti kopi tanpa cangkir; browser tidak tahu cara memainkannya. Aplikasi memiliki fungsi khusus (`pcmToWavDataUrl`) yang "membungkus" data mentah ini dengan menambahkan header standar file `.wav`. Proses ini mengubahnya menjadi file audio yang valid.

3.  **Pembuatan URL Lokal**: File `.wav` yang baru dibuat ini kemudian diberi alamat URL sementara yang hanya ada di browser Anda (menggunakan `URL.createObjectURL` atau Data URL).

4.  **Eksekusi Akhir**:
    *   Jika Anda menekan **Putar**, URL lokal ini akan langsung dimainkan oleh pemutar audio internal.
    *   Jika Anda menekan **Unduh**, URL ini akan digunakan untuk mengunduh file `.wav` tersebut ke komputer Anda.

5.  **Caching**: URL audio yang sudah dibuat akan disimpan. Jika Anda menekan tombol putar atau unduh lagi pada scene yang sama (tanpa mengubah naskahnya), aplikasi akan menggunakan URL yang sudah ada dan tidak perlu memanggil AI lagi, sehingga lebih hemat waktu dan kuota.

---

Secara singkat, alurnya adalah: **Anda Perintahkan → AI Ciptakan Suara Mentah → Aplikasi Ubah Menjadi File Audio Siap Pakai.**