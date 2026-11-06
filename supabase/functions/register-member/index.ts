import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { username, password } = await request.json();
    const normalizedUsername = String(username ?? "").trim().toLowerCase();
    const suppliedPassword = String(password ?? "");

    if (!/^[a-z0-9._-]{3,32}$/.test(normalizedUsername) || suppliedPassword.length < 8 || suppliedPassword.length > 128) {
      return json({ error: "اسم المستخدم يجب أن يكون من 3 إلى 32 حرفًا إنجليزيًا أو رقمًا، وكلمة المرور 8 أحرف على الأقل." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "إعدادات التسجيل غير مكتملة على الخادم. يلزم ضبط SUPABASE_SERVICE_ROLE_KEY." }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: existing, error: existingError } = await admin
      .from("memberships")
      .select("id")
      .eq("username", normalizedUsername)
      .maybeSingle();
    if (existingError) return json({ error: "تعذر التحقق من اسم المستخدم." }, 500);
    if (existing) return json({ error: "اسم المستخدم مستخدم بالفعل. اختر اسمًا آخر." }, 409);

    const { data: organizations, error: organizationError } = await admin
      .from("organizations")
      .select("id")
      .limit(2);
    if (organizationError || !organizations || organizations.length !== 1) {
      return json({ error: "تعذر تحديد المؤسسة. يجب أن توجد مؤسسة واحدة مفعلة قبل تسجيل الأعضاء." }, 500);
    }

    const internalEmail = `${normalizedUsername}@miad.invalid`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: internalEmail,
      password: suppliedPassword,
      email_confirm: true,
      user_metadata: { username: normalizedUsername },
    });
    if (createError || !created.user) {
      return json({ error: createError?.message || "تعذر إنشاء الحساب." }, 400);
    }

    const { error: membershipError } = await admin.from("memberships").insert({
      organization_id: organizations[0].id,
      user_id: created.user.id,
      username: normalizedUsername,
      role: "employee",
      status: "pending",
    });

    if (membershipError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: "تعذر حفظ طلب العضوية. لم يتم إنشاء الحساب؛ تحقق من إعدادات قاعدة البيانات." }, 500);
    }

    const { error: mapError } = await admin
      .schema("miad_private")
      .from("username_auth_map")
      .insert({ username: normalizedUsername, user_id: created.user.id });

    if (mapError) {
      await admin.from("memberships").delete().eq("user_id", created.user.id);
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: "تعذر إكمال ربط اسم المستخدم. لم يتم إنشاء الحساب." }, 500);
    }

    return json({ message: "تم إرسال طلب العضوية بنجاح. انتظر موافقة المدير قبل تسجيل الدخول." }, 201);
  } catch {
    return json({ error: "حدث خطأ أثناء إرسال الطلب. حاول مرة أخرى." }, 500);
  }
});
