/* global T, game, CONFIG, ui */
/**
 * Casos e2e. Cada `run` recibe la sesión ({ gm, loginPlayer, … }) y casi todo se ejecuta
 * dentro de la página del DJ con `gm.evaluate`, usando las utilidades de page-helpers.js (window.T).
 */

export const cases = [
  {
    name: "El mundo carga el sistema y sus 28 compendios",
    run: async ({ gm }) => gm.evaluate(() => {
      T.eq(game.system.id, "tdt", "sistema");
      T.eq(game.packs.filter(pack => pack.metadata.packageName === "tdt").length, 28, "compendios");
      T.ok(game.tdt, "API game.tdt");
    })
  },
  {
    name: "Todos los documentos de los compendios se cargan sin errores de validación",
    run: async ({ gm }) => gm.evaluate(async () => {
      let total = 0;
      const broken = [];
      for (const pack of game.packs.filter(entry => entry.metadata.packageName === "tdt")) {
        try {
          const documents = await pack.getDocuments();
          total += documents.length;
          for (const document of documents) if (document.invalid || document._source?._stats?.invalid) broken.push(`${pack.collection}: ${document.name}`);
        } catch (error) {
          broken.push(`${pack.collection}: ${error.message}`);
        }
      }
      T.eq(broken, [], "documentos rotos");
      T.eq(total, 557, "documentos totales");
    })
  },
  {
    name: "Las fichas de personaje, PNJ y mecha se abren sin errores",
    run: async ({ gm }) => gm.evaluate(async () => {
      const actors = [await T.actor("character", {}), await T.actor("npc", {}), await T.actor("mecha", {})];
      await T.give(actors[0], "basic-feats", "Posición ofensiva");
      await T.give(actors[0], "basic-weapons", "Katana");
      for (const actor of actors) {
        await T.renderSheet(actor.sheet, `ficha de ${actor.type}`);
        await actor.sheet.close();
      }
    })
  },
  {
    name: "Las fichas de cada tipo de objeto se abren sin errores",
    run: async ({ gm }) => gm.evaluate(async () => {
      const samples = [["basic-feats", "Gordo"], ["basic-weapons", "Katana"], ["basic-armor", null], ["basic-gear", null], ["fantasy-races", "Enano"], ["fantasy-circles", null], ["powers-powers", "Superfuerza"], ["cyber-implants", "Brazo robótico"], ["cyber-hacks", "Chispazo intravenoso"]];
      const actor = await T.actor("character", {});
      for (const [pack, name] of samples) {
        const collection = game.packs.get(`tdt.${pack}`);
        const index = await collection.getIndex();
        const entry = name ? index.find(item => item.name === name) : index.contents[0];
        T.ok(entry, `${pack}: ${name}`);
        const data = (await collection.getDocument(entry._id)).toObject();
        const [item] = await actor.createEmbeddedDocuments("Item", [data]);
        await T.renderSheet(item.sheet, `ficha de ${item.type} (${item.name})`);
        await item.sheet.close();
      }
    })
  },
  {
    name: "Tirada básica y crítico (dobles suman otra vez)",
    run: async ({ gm }) => gm.evaluate(async () => {
      const actor = await T.actor("character", T.hero({ skills: { athletics: { die: 6 } } }));
      T.dice([6, 3], [6, 3]);
      const { value } = await T.roll(() => actor.rollSkill("athletics"));
      T.diceDone();
      T.eq(value.total, 9, "3 + 3 + crítico 3");
      T.ok(value.isCritical, "crítico");
    })
  },
  {
    name: "Pifia sin habilidad: un 1 en la característica + el 1 fijo",
    run: async ({ gm }) => gm.evaluate(async () => {
      const actor = await T.actor("character", T.hero());
      T.dice([6, 1]);
      const { value } = await T.roll(() => actor.rollSkill("stealth"));
      T.diceDone();
      T.ok(value.isFumble, "pifia");
      T.ok(!value.isCritical, "nunca crítico sin habilidad");
    })
  },
  {
    name: "Gordo: la habilidad se tira dos veces y se queda la peor (desmarcada por defecto)",
    run: async ({ gm }) => gm.evaluate(async () => {
      const actor = await T.actor("character", T.hero({ skills: { athletics: { die: 6 } } }));
      await T.give(actor, "basic-feats", "Gordo");
      T.dice([6, 4], [6, 5], [6, 2]);
      const { value, dialog } = await T.roll(() => actor.rollSkill("athletics"), { check: ["Gordo"] });
      T.diceDone();
      T.ok(dialog.rules.some(rule => rule.text.includes("Gordo") && rule.text.includes("habilidad")), "etiqueta de la regla");
      T.eq(value.total, 6, "4 + min(5, 2)");
      // Sin marcarla, un dado normal.
      T.dice([6, 4], [6, 5]);
      const second = await T.roll(() => actor.rollSkill("athletics"));
      T.diceDone();
      T.ok(second.dialog.rules.find(rule => rule.text.includes("Gordo"))?.checked === false, "sale desmarcada");
      T.eq(second.value.total, 9, "sin desventaja");
    })
  },
  {
    name: "Cobarde: con Mente d4, el dado de Mente pasa a ser un 1 fijo",
    run: async ({ gm }) => gm.evaluate(async () => {
      const actor = await T.actor("character", T.hero({ attributes: { power: { die: 6 }, dexterity: { die: 6 }, mind: { die: 4 }, social: { die: 4 } } }));
      await T.give(actor, "basic-feats", "Cobarde");
      T.dice([6, 4]);
      const { value } = await T.roll(() => actor.rollDefense("will"), { check: ["Cobarde"] });
      T.diceDone();
      T.eq(value.total, 5, "1 fijo + 4");
    })
  },
  {
    name: "Alergia: se añade 1d4 y se conservan los dos menores",
    run: async ({ gm }) => gm.evaluate(async () => {
      const actor = await T.actor("character", T.hero({ skills: { athletics: { die: 8 } } }));
      await T.give(actor, "basic-feats", "Alergia");
      T.dice([6, 5], [8, 7], [4, 2]);
      const { value } = await T.roll(() => actor.rollSkill("athletics"), { check: ["Alergia"] });
      T.diceDone();
      T.eq(value.total, 7, "5 + 2 (el 7 se descarta)");
    })
  },
  {
    name: "Posición ofensiva activable: aguante −1 y esquiva d4 a 1 fijo; +1 al atacar",
    run: async ({ gm }) => gm.evaluate(async () => {
      const actor = await T.actor("character", T.hero({ defenses: { evasion: { die: 4 } } }));
      const feat = await T.give(actor, "basic-feats", "Posición ofensiva");
      const before = actor.system.endurance.value;
      T.ok(feat.system.toggle, "es activable");
      await feat.update({ "system.active": true });
      T.eq(actor.system.endurance.value, before - 1, "aguante −1");
      T.dice([6, 3]);
      const { value, dialog } = await T.roll(() => actor.rollDefense("evasion"));
      T.diceDone();
      T.ok(dialog.rules.some(rule => rule.text.includes("Posición ofensiva") && rule.checked), "regla aplicada");
      T.eq(value.total, 4, "3 + 1 fijo");
      await feat.update({ "system.active": false });
      T.eq(actor.system.endurance.value, before, "al apagarla vuelve el aguante");
    })
  },
  {
    name: "Golpe vital: el crítico al atacar se suma una vez más",
    run: async ({ gm }) => gm.evaluate(async () => {
      const actor = await T.actor("character", T.hero({ skills: { melee: { die: 6 } } }));
      await T.give(actor, "basic-feats", "Golpe vital");
      const weapon = await T.give(actor, "basic-weapons", "Cuchillo de combate", { "system.equipped": true });
      T.dice([6, 4], [6, 4]);
      const { value } = await T.roll(() => actor.rollWeapon(weapon));
      T.diceDone();
      T.eq(value.total, 16, "4 + 4 + 4 + 4");
    })
  },
  {
    name: "Bajar la dificultad cuenta contra la defensa del objetivo",
    run: async ({ gm }) => gm.evaluate(async () => {
      const actor = await T.actor("character", T.hero({ skills: { melee: { die: 6 } } }));
      const weapon = await T.give(actor, "basic-weapons", "Cuchillo de combate", { "system.equipped": true });
      const target = await T.actor("npc", { health: { value: 10, max: 10 }, endurance: { base: 0, value: 0 }, npcStats: { evasion: 9, fortitude: 5, will: 5, perception: 5 } }, "Objetivo");
      T.targets([target]);
      T.dice([6, 3], [6, 5]);
      await T.roll(() => actor.rollWeapon(weapon), { fields: { difficulty: 9 } });
      T.diceDone();
      T.ok(/falla/.test(T.messageText(T.lastMessage())), "8 contra 9 falla sin regla");
      // Con una regla de dificultad −2 (Mente de tiburón valdría igual: cualquier regla «difficulty»).
      await actor.createEmbeddedDocuments("Item", [{ name: "Prueba dificultad", type: "feat", system: { rules: [{ type: "difficulty", value: 2, scopes: ["attack"], label: "Dificultad −2" }] } }]);
      T.dice([6, 3], [6, 5]);
      await T.roll(() => actor.rollWeapon(weapon), { fields: { difficulty: 9 } });
      T.diceDone();
      const text = T.messageText(T.lastMessage());
      T.ok(!/falla/.test(text) && /Aplicar/.test(text), `8 contra 9 − 2 acierta: ${text}`);
    })
  },
  {
    name: "Misiles de PNJ: el Área hace de Daño",
    run: async ({ gm }) => gm.evaluate(async () => {
      const npcPack = game.packs.get("tdt.basic-npcs");
      const index = await npcPack.getIndex();
      const data = (await npcPack.getDocument(index.find(entry => entry.name === "Helicóptero")._id)).toObject();
      const helicopter = await Actor.create(data);
      T.created.push(helicopter);
      const missiles = helicopter.items.find(item => item.name === "Misiles");
      T.ok(missiles, "el helicóptero tiene misiles");
      await helicopter.npcAttack(missiles);
      await T.sleep(100);
      const text = T.messageText(T.lastMessage());
      T.ok(/Daño:\s*6/.test(text), `Daño 6 por Área: ${text}`);
    })
  },
  {
    name: "Defenderse: pifia ×2 y el mismo personaje no puede defenderse dos veces",
    run: async ({ gm }) => gm.evaluate(async () => {
      const actor = await T.actor("character", T.hero({ health: { value: 10, max: 10 } }), "Defensor");
      await game.user.update({ character: actor.id });
      const npc = await T.actor("npc", { npcStats: { evasion: 5, fortitude: 5, will: 5, perception: 5 } }, "Atacante");
      const [weapon] = await npc.createEmbeddedDocuments("Item", [{ name: "Puñetazo", type: "weapon", system: { attackDifficulty: 5, damage: 3, skill: "brawl" } }]);
      await T.roll(() => npc.npcAttack(weapon), { button: "ok" }); // «Número de ataques»: la primera opción es 1
      const message = T.lastMessage();
      const endurance = actor.system.endurance.value;
      // Pifia: 1 + 1 = 2 contra 5 → entrante 3, + Daño 3 − aguante, ×2.
      T.dice([6, 1], [6, 1]);
      const seen = new Set(Object.values(ui.windows).map(app => app.appId));
      (await T.chatButton(message, "defend")).click();
      await T.answer({ seen });
      await T.sleep(400);
      T.diceDone();
      const expected = Math.max(0, 3 + 3 - endurance) * 2;
      T.eq(actor.system.health.value, 10 - expected, "vida tras la pifia");
      // Segundo clic: aviso y sin daño.
      const warnings = [];
      const original = ui.notifications.warn.bind(ui.notifications);
      ui.notifications.warn = (text, ...rest) => { warnings.push(text); return original(text, ...rest); };
      (await T.chatButton(game.messages.get(message.id), "defend")).click();
      await T.sleep(500);
      ui.notifications.warn = original;
      T.ok(warnings.some(text => /ya se ha defendido/.test(text)), `aviso de defensa repetida: ${warnings.join(" | ")}`);
      T.eq(actor.system.health.value, 10 - expected, "no recibe el golpe otra vez");
      await game.user.update({ character: null });
    })
  },
  {
    name: "Guerrero ignora 1 de aguante del objetivo",
    run: async ({ gm }) => gm.evaluate(async () => {
      const actor = await T.actor("character", T.hero({ skills: { melee: { die: 6 } } }));
      await T.give(actor, "basic-feats", "Guerrero");
      const weapon = await T.give(actor, "basic-weapons", "Cuchillo de combate", { "system.equipped": true });
      const target = await T.actor("npc", { endurance: { base: 2, value: 2 }, npcStats: { evasion: 5, fortitude: 5, will: 5, perception: 5 } }, "Blindado");
      T.targets([target]);
      T.dice([6, 4], [6, 5]);
      await T.roll(() => actor.rollWeapon(weapon));
      T.diceDone();
      const text = T.messageText(T.lastMessage());
      const match = text.match(/Aplicar (\d+)/);
      T.ok(match, `hay botón de daño: ${text}`);
      // 9 − 5 = 4 entrante + Daño del cuchillo − (aguante 2 − 1).
      T.eq(Number(match[1]), 4 + weapon.system.damage - Math.max(0, target.system.endurance.value - 1), "daño con Guerrero");
    })
  },
  {
    name: "Superfuerza queda activa al usarla y suma Daño +4 cuerpo a cuerpo",
    run: async ({ gm }) => gm.evaluate(async () => {
      const actor = await T.actor("character", T.hero({ skills: { melee: { die: 6 } }, powers: { energy: { value: 20 } } }));
      const power = await T.give(actor, "powers-powers", "Superfuerza");
      const using = actor.usePower(power);
      await T.answer({ fields: { overload: 0 } });
      await using;
      T.ok(actor.items.get(power.id).system.active, "poder activo");
      T.eq(actor.system.powers.energy.value, 19, "gasta 1 de energía");
      const weapon = await T.give(actor, "basic-weapons", "Cuchillo de combate", { "system.equipped": true });
      const target = await T.actor("npc", { endurance: { base: 0, value: 0 }, npcStats: { evasion: 5, fortitude: 5, will: 5, perception: 5 } }, "Saco");
      T.targets([target]);
      T.dice([6, 4], [6, 5]);
      const { dialog } = await T.roll(() => actor.rollWeapon(weapon));
      T.diceDone();
      T.ok(dialog.rules.some(rule => rule.text.includes("Superfuerza") && rule.checked), "regla de Superfuerza aplicada");
      const match = T.messageText(T.lastMessage()).match(/Aplicar (\d+)/);
      T.eq(Number(match?.[1]), 4 + weapon.system.damage + 4, "Daño +4");
    })
  },
  {
    name: "Multijugador: el jugador aplica daño a un PNJ ajeno y el botón queda marcado por el DJ",
    run: async ({ gm, loginPlayer }) => {
      const ids = await gm.evaluate(async () => {
        const player = game.users.getName("Jugador");
        const actor = await T.actor("character", { ...{ attributes: { power: { die: 6 }, dexterity: { die: 6 }, mind: { die: 6 }, social: { die: 4 } } }, skills: { melee: { die: 6 } } }, "PJ del jugador");
        await actor.update({ [`ownership.${player.id}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER });
        const target = await T.actor("npc", { health: { value: 10, max: 10 }, endurance: { base: 0, value: 0 }, npcStats: { evasion: 5, fortitude: 5, will: 5, perception: 5 } }, "PNJ del DJ");
        await target.update({ "ownership.default": CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED });
        return { actor: actor.id, target: target.id };
      });
      const player = await loginPlayer();
      await player.evaluate(async ({ actor: actorId, target: targetId }) => {
        const actor = game.actors.get(actorId);
        const target = game.actors.get(targetId);
        T.ok(actor.isOwner && !target.isOwner, "permisos de prueba");
        const [weapon] = await actor.createEmbeddedDocuments("Item", [{ name: "Navaja", type: "weapon", system: { damage: 2, skill: "melee", attribute: "power", equipped: true } }]);
        T.targets([target]);
        T.dice([6, 4], [6, 5]);
        await T.roll(() => actor.rollWeapon(weapon));
        T.diceDone();
        (await T.chatButton(T.lastMessage(), "apply-damage")).click();
      }, ids);
      // El DJ confirma la solicitud de daño.
      await gm.evaluate(async () => {
        await T.answer({ button: "yes" });
        await T.sleep(800);
      });
      const result = await gm.evaluate(async ({ target: targetId }) => {
        const message = T.lastMessage();
        return { health: game.actors.get(targetId).system.health.value, applied: message.getFlag("tdt", "appliedActions") ?? [] };
      }, ids);
      if (result.health !== 10 - (4 + 2)) throw new Error(`Vida del PNJ: esperaba 4 y es ${result.health}`);
      if (!result.applied.length) throw new Error("El DJ no ha marcado el botón como usado");
      await player.evaluate(async () => {
        await T.sleep(300);
        const button = await T.chatButton(T.lastMessage(), "apply-damage");
        T.ok(button.disabled, "el botón aparece desactivado para el jugador");
      });
    }
  }
];
