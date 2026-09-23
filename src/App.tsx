import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { sb } from "./lib/supabase";
import { carregarEstado, type Estado } from "./lib/dados";
import { AppProvider } from "./estado";
import Login, { NovaSenha } from "./telas/Login";
import Shell from "./telas/Shell";
import { Overlays } from "./comp/Overlays";

export default function App() {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [erro, setErro] = useState("");
  const [recuperando, setRecuperando] = useState(false);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((ev, s) => {
      if (ev === "PASSWORD_RECOVERY") setRecuperando(true);
      setSessao(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!sessao) { setEstado(null); return; }
    let vivo = true;
    setErro("");
    carregarEstado()
      .then(e => { if (!vivo) return; setEstado(e); })
      .catch(e => vivo && setErro(e?.message || "Erro ao carregar"));
    return () => { vivo = false; };
  }, [sessao?.user?.id]);

  if (sessao === undefined) return null;
  if (recuperando && sessao) return <NovaSenha aoConcluir={() => setRecuperando(false)} />;
  if (!sessao) return <Login />;
  if (erro) return <Login aviso={"Não foi possível carregar o sistema: " + erro} />;
  if (!estado) return <Login carregando />;

  const eu = estado.usuarios.find(u => u.id === sessao.user.id);
  if (!eu || !eu.ativo) {
    return <Login aviso="Seu usuário ainda não tem acesso ao ALIANÇA 360. Fale com a Gestão." sairAntes />;
  }
  return (
    <AppProvider uid={eu.id} inicial={estado} overlays={(o) => <Overlays {...o} />}>
      <Shell />
    </AppProvider>
  );
}
