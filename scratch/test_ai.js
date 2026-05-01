(async () => {
  try {
    const res = await fetch("https://jisbvqrnnujqgbsfondy.supabase.co/functions/v1/extract-equipment-list", {
      method: "POST",
      headers: {
        "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppc2J2cXJubnVqcWdic2ZvbmR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1OTEwNzUsImV4cCI6MjA5MzE2NzA3NX0.DvEz4j0DVpVJHu_Ag9Fgtksbb2BzSARSSJWKhx-eduI",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ texto: "5 Par Anilha Bumper 10Kg" })
    });
    const data = await res.json();
    console.log("STATUS:", res.status);
    console.log("RESPONSE:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("ERROR:", err);
  }
})();
