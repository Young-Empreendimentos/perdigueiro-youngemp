# Edge functions do Perdigueiro

Conferido com o código **publicado** no Supabase em 10/11/2026. Antes de publicar qualquer uma daqui, compare com a
versão publicada (`get_edge_function`): o publicado é o que vale.

| Função | Situação |
|---|---|
| `generate-weekly-report` | Relatórios de segunda. Só aceita o agendamento (cabeçalho `x-cron-secret`, senha no Vault `perdigueiro_relatorio_cron`) ou login de admin do Perdigueiro. Publicar com `verify_jwt = false` (o agendamento não manda login). |
| `sync-drive-glebas` | Importa glebas de um KML do Google Drive. Só membros do Perdigueiro. `verify_jwt = true`. |
| `serve-kml-network-link` | Camada do Google Earth (`?token=`). Publicar com `verify_jwt = false`, senão o Earth recebe 401. |
| `process-kmz`, `download-proposta-file` | Usadas pelo app. |
| `upload-to-drive`, `list-drive-files`, `test-drive-kml`, `delete-user` | **Desativadas** em 10/11/2026: só respondem 410. Ninguém usa. |

**`create-user` não fica neste repositório.** O endereço `create-user` publicado no Supabase é a função do **CRM**
(lê `crm.crm_user_roles`). A versão antiga do Perdigueiro que estava aqui foi removida em 10/11/2026: publicar
daqui apagaria a do CRM. O Perdigueiro não cria login (a tela Configurações só mexe em `perdigueiro_membros`).
