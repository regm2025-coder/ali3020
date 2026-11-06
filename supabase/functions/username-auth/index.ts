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

    if (!/^[a-z0-9._-]{3,32}$/.test(normalizedUsername) || suppliedPassword.length < 1 || suppliedPassword.length > 128) {
      return json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json({ error: "إعدادات تسجيل الدخول غير مكتملة على الخادم." }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: membership, error: membershipError } = await admin
      .from("memberships")
      .select("id, user_id, organization_id, username, role, status")
      .eq("username", normalizedUsername)
      .maybeSingle();

    if (membershipError || !membership || membership.status !== "approved") {
      return json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة، أو أن الحساب غير معتمد." }, 401);
    }

    const { data: userResult, error: userError } = await admin.auth.admin.getUserById(membership.user_id);
    if (userError || !userResult.user?.email) {
      return json({ error: "تعذر التحقق من الحساب." }, 401);
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: login, error: loginError } = await authClient.auth.signInWithPassword({
      email: userResult.user.email,
      password: suppliedPassword,
    });

    if (loginError || !login.session) {
      return json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة." }, 401);
    }

    const { data: organization } = await admin
      .from("organizations")
      .select("name")
      .eq("id", membership.organization_id)
      .maybeSingle();

    return json({
      session: login.session,
      membership: {
        id: membership.id,
        user_id: membership.user_id,
        organization_id: membership.organization_id,
        username: membership.username,
        role: membership.role,
        status: membership.status,
        organization_name: organization?.name ?? "مؤسستك",
      },
    });
  } catch {
    return json({ error: "حدث خطأ أثناء تسجيل الدخول. حاول مرة أخرى." }, 500);
  }
});
