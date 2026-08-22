家事分担 v10

追加内容
1. Supabaseを使った端末間同期
2. 同じGitHub Pages URLを2台のiPhoneで開き、同じSupabase設定と共有コードを入れるとデータ共有
3. 家事記録・家事項目・2人の名前・現在の集計・月別回数表が同期
4. Realtime購読に加えて5秒ごとの再取得も実施
5. ローカル保存も残しているため、一時的に通信できない場合でも端末内データを保持

初回設定
1. Supabaseで無料プロジェクトを作成
2. SQL Editorで supabase_setup.sql を実行
3. Project URL と Anon Key を取得
4. アプリの「端末間同期」に入力
5. 推測されにくい共有コードを入力
6. 2台目のiPhoneにも同じ3項目を入力

注意
この簡易版は、Supabaseの匿名アクセスを許可して共有コードでデータを分ける方式です。
共有コードには長くランダムな文字列を使用してください。

GitHubへアップロードするファイル
- index.html
- settings.html
- chores.html
- report.html
- cloud.html
- cloud.js
- manifest.webmanifest
- sw.js
- supabase_setup.sql
- README.txt
