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
    name: "La barra lateral oculta los compendios desactivados aunque se filtre",
    run: async ({ gm }) => gm.evaluate(async () => {
      // Foundry reescribe el display de cada entrada al aplicar el filtro de búsqueda tras el render.
      const entry = id => ui.compendium.element?.querySelector(`[data-pack="${id}"], [data-entry-id="${id}"]`);
      const visible = id => getComputedStyle(entry(id)).display !== "none";
      const rerender = async () => {
        ui.sidebar.changeTab("compendium", "primary");
        await ui.compendium.render({ force: true });
        const start = Date.now();
        while (!entry("tdt.basic-feats") && Date.now() - start < 5000) await T.sleep(50);
        T.ok(entry("tdt.basic-feats") && entry("tdt.basic-weapons"), "la barra lateral muestra los compendios");
        await T.sleep(1000); // el filtro de búsqueda se aplica después del render
      };
      await game.settings.set("tdt", "rule.specificWeapons", false);
      try {
        await rerender();
        T.eq(visible("tdt.basic-weapons"), false, "armas específicas ocultas");
        T.eq(visible("tdt.basic-feats"), true, "dotes básicas visibles");
      } finally {
        await game.settings.set("tdt", "rule.specificWeapons", true);
      }
      await rerender();
      T.eq(visible("tdt.basic-weapons"), true, "armas específicas visibles otra vez");
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
    name: "Defenderse: la pifia ignora el aguante y el mismo personaje no puede defenderse dos veces",
    run: async ({ gm }) => gm.evaluate(async () => {
      const actor = await T.actor("character", T.hero({ health: { value: 10, max: 10 } }), "Defensor");
      await game.user.update({ character: actor.id });
      const npc = await T.actor("npc", { npcStats: { evasion: 5, fortitude: 5, will: 5, perception: 5 } }, "Atacante");
      const [weapon] = await npc.createEmbeddedDocuments("Item", [{ name: "Puñetazo", type: "weapon", system: { attackDifficulty: 5, damage: 3, skill: "brawl" } }]);
      await T.roll(() => npc.npcAttack(weapon), { button: "ok" }); // «Número de ataques»: la primera opción es 1
      const message = T.lastMessage();
      const endurance = actor.system.endurance.value;
      // Pifia: 1 + 1 = 2 contra 5 → entrante 3, + Daño 3, sin restar el aguante.
      T.dice([6, 1], [6, 1]);
      const seen = new Set(Object.values(ui.windows).map(app => app.appId));
      (await T.chatButton(message, "defend")).click();
      await T.answer({ seen });
      await T.sleep(400);
      T.diceDone();
      T.ok(endurance > 0, "el defensor tiene aguante");
      const expected = 3 + 3;
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
  ,
  {
    name: "Caer a 0 PV: dificultad = daño sobrante, tiradas de caído ±2 y curarse quita el estado",
    run: async ({ gm }) => gm.evaluate(async () => {
      const actor = await T.actor("character", T.hero({ health: { value: 3, max: 10 }, defenses: { fortitude: { die: 6 } } }));
      await actor.applyDamage(8, { raw: true });
      T.eq(actor.system.health.value, 0, "vida");
      T.eq([actor.system.dying.active, actor.system.dying.difficulty], [true, 5], "caído con dificultad 5");
      T.dice([6, 4], [6, 3]); // 7 contra 5: supera, baja a 3
      await T.roll(() => actor.rollDying());
      T.diceDone();
      T.eq(actor.system.dying.difficulty, 3, "baja 2 al superarla");
      T.dice([6, 1], [6, 2]); // 3 contra 3: supera (empate gana), baja a 1 → estable
      await T.roll(() => actor.rollDying());
      T.diceDone();
      T.eq(actor.system.dying.active, false, "con 1 o menos se estabiliza");
      // Volver a caer y curarse desde la ficha.
      await actor.applyDamage(6, { raw: true });
      T.ok(actor.system.dying.active, "vuelve a estar caído");
      await actor.update({ "system.health.value": 3 });
      T.eq([actor.system.dying.active, actor.system.dying.difficulty], [false, 0], "curarse termina el estado de caído");
    })
  },
  {
    name: "Caer con poco daño sobrante: estabilizado sin tiradas; mucho fallo: muerte",
    run: async ({ gm }) => gm.evaluate(async () => {
      const actor = await T.actor("character", T.hero({ health: { value: 2, max: 10 } }));
      await actor.applyDamage(3, { raw: true });
      T.eq(actor.system.dying.active, false, "sobrante 1: estable");
      await actor.update({ "system.health.value": 1 });
      await actor.applyDamage(10, { raw: true });
      T.eq(actor.system.dying.difficulty, 9, "sobrante 9");
      T.dice([6, 2], [6, 3]); // 5 contra 9: falla, sube a 11
      await T.roll(() => actor.rollDying());
      T.diceDone();
      T.ok(/ha muerto/.test(T.messageText(T.lastMessage())), "muere con 10 o más");
    })
  },
  {
    name: "Hacking: usos por escena, Sobrecarga neural y reinicio con el descanso pequeño",
    run: async ({ gm }) => gm.evaluate(async () => {
      const actor = await T.actor("character", T.hero({ attributes: { power: { die: 4 }, dexterity: { die: 6 }, mind: { die: 8 }, social: { die: 6 } }, skills: { hacking: { die: 8 } } }));
      await T.give(actor, "cyber-implants", "AVS (Advanced VirtualSelf)", { "system.installed": true, "system.slots": 2 });
      const chispazo = await T.give(actor, "cyber-hacks", "Chispazo intravenoso", { "system.loaded": true });
      const reinicio = await T.give(actor, "cyber-hacks", "Reinicio forzoso", { "system.loaded": true });
      T.eq([actor.system.cyberStats.slots, actor.system.cyberStats.usesLeft], [2, 2], "2 ranuras, 2 usos");
      const target = await T.actor("npc", { endurance: { base: 0, value: 0 }, npcStats: { evasion: 6, fortitude: 6, will: 5, perception: 5 } }, "Guardia");
      T.targets([target]);
      T.dice([8, 5], [8, 4]);
      await T.roll(() => actor.castHack(chispazo));
      T.diceDone();
      T.ok(/Aplicar 5/.test(T.messageText(T.lastMessage())), `9 − 6 = 3 + Daño 2: ${T.messageText(T.lastMessage())}`);
      T.eq(actor.system.cyberStats.usesLeft, 1, "gasta un uso");
      T.dice([8, 5], [8, 4]);
      await T.roll(() => actor.castHack(reinicio));
      T.diceDone();
      T.eq([actor.system.cyberStats.usesLeft, actor.system.cyber.neuralOverload], [0, 1], "sin usos y con Sobrecarga neural");
      await actor.castHack(chispazo);
      T.ok(T.notes.some(note => /todos los hacks de esta escena/.test(note.message)), "no deja lanzar sin usos");
      await actor.newScene();
      T.eq([actor.system.cyberStats.usesLeft, actor.system.cyber.neuralOverload], [2, 0], "la escena nueva reinicia");
    })
  },
  {
    name: "Exceso de carga: CC = 10 + Social × 5; fallar por 4 o más hace que se le vaya la pinza",
    run: async ({ gm }) => gm.evaluate(async () => {
      const actor = await T.actor("character", T.hero({ attributes: { power: { die: 6 }, dexterity: { die: 6 }, mind: { die: 6 }, social: { die: 4 } }, defenses: { will: { die: 6 } } }));
      T.eq(actor.system.cyberStats.cc, 15, "CC con Social d4");
      for (const name of ["Exoesqueleto", "Médula ósea acelerada", "Ojos cibernéticos", "Brazo robótico"]) await T.give(actor, "cyber-implants", name, { "system.installed": true });
      T.eq([actor.system.cyberStats.load, actor.system.cyberStats.excess], [19, 4], "carga 7+5+4+3 y exceso 4");
      T.dice([6, 2], [6, 1]); // 3 contra 8: falla por 5
      let outcome;
      await T.roll(async () => { outcome = await actor.rollExcess(); return outcome; });
      T.diceDone();
      T.eq(outcome?.key, "snap", "se le va la pinza");
    })
  },
  {
    name: "Implante en clínica: cobra 1.000 € por punto de CC y queda instalado",
    run: async ({ gm }) => gm.evaluate(async () => {
      const actor = await T.actor("character", T.hero({ money: 10000 }));
      const arm = await T.give(actor, "cyber-implants", "Brazo robótico");
      T.eq(arm.system.installed, true, "del compendio llega instalado (lo administra el DJ)");
      await arm.update({ "system.installed": false }); // el DJ decide que pase por la clínica
      const installing = actor.installImplant(arm);
      await T.answer({ button: "ok" }); // la primera opción es la clínica
      await installing;
      T.eq([actor.items.get(arm.id).system.installed, actor.system.money], [true, 7000], "instalado y 3.000 € menos");
    })
  },
  {
    name: "Conducir: característica + 1d4; Kansei Dorifto lo sube a d8 y bonifica 1",
    run: async ({ gm }) => gm.evaluate(async () => {
      const actor = await T.actor("character", T.hero());
      const car = await T.give(actor, "cyber-gear", "Deportivo"); // Conducción: Bonifica en 1
      await actor.driveVehicle(car);
      T.ok(T.notes.some(note => /Necesitas la dote Conducir/.test(note.message)), "sin dote no conduce");
      await actor.createEmbeddedDocuments("Item", [{ name: "Conducir (coche)", type: "feat", system: {} }]);
      // 6 (máximo) y 1: ningún bonifica cabe, así se ve el dado tirado sin interferencias.
      T.dice([6, 6], [4, 1]);
      const plain = await T.roll(() => actor.driveVehicle(car));
      T.diceDone();
      T.eq(plain.value.total, 7, "Destreza + 1d4");
      T.ok(plain.dialog.rules.some(rule => rule.text.includes("Deportivo") && rule.text.includes("bonifica en 1")), "el vehículo bonifica 1");
      await actor.createEmbeddedDocuments("Item", [{ name: "Kansei Dorifto (coche)", type: "feat", system: {} }]);
      T.dice([6, 3], [8, 2]);
      const kansei = await T.roll(() => actor.driveVehicle(car));
      T.diceDone(); // comprueba que el segundo dado es un d8
      T.ok(kansei.dialog.rules.some(rule => rule.text.includes("Kansei Dorifto") && rule.checked), "Kansei bonifica 1");
      T.ok(kansei.value.total >= 5, "3 + 2 más los bonifica");
    })
  },
  {
    name: "Todos los vehículos tienen categoría, PV y aguante legibles",
    run: async ({ gm }) => gm.evaluate(async () => {
      const { vehicleProfile } = await import("/systems/tdt/scripts/modules/vehicle.mjs");
      const broken = [];
      for (const name of ["basic-gear", "cyber-gear"]) {
        for (const item of await game.packs.get(`tdt.${name}`).getDocuments()) {
          if (item.system.category !== "vehicle") continue;
          const profile = vehicleProfile(item);
          // En el básico cualquier «Conducir» vale (categoría genérica); en el cyberpunk cada vehículo pide la suya.
          if ((name === "cyber-gear" && profile.category === "vehículo") || !profile.health.max || !(profile.endurance >= 0)) broken.push(`${item.name}: ${JSON.stringify({ category: profile.category, health: profile.health.max, endurance: profile.endurance })}`);
        }
      }
      T.eq(broken, [], "vehículos sin datos");
    })
  },
  {
    name: "Magia simple: Proyectil mágico sube la dificultad Incremental tras gastar la reserva",
    run: async ({ gm }) => gm.evaluate(async () => {
      const actor = await T.actor("character", T.hero({ attributes: { power: { die: 4 }, dexterity: { die: 6 }, mind: { die: 6 }, social: { die: 6 } }, skills: { arcana: { die: 6 } } }));
      const spell = await T.give(actor, "fantasy-feats", "Proyectil mágico");
      T.eq(actor.system.fantasy.reserveMax, 2, "reserva = puntuación de Mente d6");
      const cast = async () => { T.dice([6, 4], [6, 3]); await T.roll(() => actor.castSimpleSpell(spell)); T.diceDone(); };
      await cast();
      T.eq(actor.system.fantasy.incremental.difficulty, 2, "el primer Incremental 2 se paga con la reserva");
      await cast();
      T.eq(actor.system.fantasy.incremental.difficulty, 4, "el segundo sube la dificultad en 2");
      await actor.rest({});
      T.eq([actor.system.fantasy.incremental.difficulty, actor.system.fantasy.incremental.reserveUsed], [2, 0], "el descanso reinicia el contador");
    })
  },
  {
    name: "Descanso: 1 PV, +1 si te tratan y +1 si quien trata tiene Manos sanadoras",
    run: async ({ gm }) => gm.evaluate(async () => {
      const actor = await T.actor("character", T.hero());
      await actor.update({ "system.health.value": 2 });
      await actor.rest({});
      T.eq(actor.system.health.value, 3, "solo descansar cura 1");
      await actor.rest({ treated: true });
      T.eq(actor.system.health.value, 5, "con tratamiento cura 2");
      await actor.rest({ treated: true, healerHands: true });
      T.eq(actor.system.health.value, 8, "con tratamiento y Manos sanadoras cura 3");
      await actor.rest({ healerHands: true });
      T.eq(actor.system.health.value, 9, "Manos sanadoras sin tratamiento no suma");
      // Desde el diálogo del botón.
      await actor.update({ "system.health.value": 1 });
      const seen = new Set(Object.values(ui.windows).map(app => app.appId));
      const pending = actor.rest();
      await T.answer({ fields: { treated: true, healerHands: true }, button: "ok", seen });
      await pending;
      T.eq(actor.system.health.value, 4, "el diálogo aplica los dos extras");
      T.ok(/Recupera 3 PV/.test(T.messageText(T.lastMessage())), "el chat lo cuenta");
      await actor.update({ "system.health.value": 10 });
      await actor.rest({ treated: true });
      T.eq(actor.system.health.value, 10, "no pasa del máximo");
    })
  },
  {
    name: "Zombis: mordisco con Anticuerpos Z (dificultad 8, empieza en zombificación 2)",
    run: async ({ gm }) => gm.evaluate(async () => {
      const actor = await T.actor("character", T.hero({ defenses: { fortitude: { die: 6 } } }));
      T.dice([6, 5], [6, 4]); // 9 contra 10: falla
      await T.roll(() => actor.zombieBite());
      T.diceDone();
      T.eq(actor.system.zombie.zombification, 1, "sin anticuerpos empieza en 1");
      const other = await T.actor("character", T.hero({ defenses: { fortitude: { die: 6 } } }));
      await T.give(other, "zombie-feats", "Anticuerpos Z");
      T.dice([6, 5], [6, 3]); // 8 exacto: solo resiste si la dificultad es 8 (sin la dote sería 10)
      await T.roll(() => other.zombieBite());
      T.diceDone();
      T.eq(other.system.zombie.zombification, 0, "con Anticuerpos Z la dificultad es 8");
      T.dice([6, 3], [6, 2]);
      await T.roll(() => other.zombieBite());
      T.diceDone();
      T.eq(other.system.zombie.zombification, 2, "con Anticuerpos Z empieza en 2");
    })
  },
  {
    name: "Mecha: Maniobra táctica usa el mejor dado de esquiva del piloto + el dado del mecha",
    run: async ({ gm }) => gm.evaluate(async () => {
      const pilot = await T.actor("character", T.hero({ attributes: { power: { die: 6 }, dexterity: { die: 8 }, mind: { die: 6 }, social: { die: 4 } }, defenses: { evasion: { die: 6 } } }), "Piloto");
      const mecha = await T.actor("mecha", { category: 1, pilot: pilot.uuid }, "Mecha de prueba");
      const faces = mecha.system.dice.maneuver;
      T.ok(faces, "el mecha tiene dado de maniobra");
      T.dice([8, 5], [faces, 2]);
      const { value } = await T.roll(() => mecha.rollMechaStat("maneuver"));
      T.diceDone();
      T.eq(value.total, 7, "d8 de Destreza + dado de maniobra");
    })
  },
  {
    name: "Repetir una tirada gastando el punto de héroe",
    run: async ({ gm }) => gm.evaluate(async () => {
      const actor = await T.actor("character", T.hero({ heroPoint: 1, skills: { athletics: { die: 6 } } }));
      T.dice([6, 2], [6, 1]);
      await T.roll(() => actor.rollSkill("athletics"));
      T.diceDone();
      const message = T.lastMessage();
      T.dice([6, 5], [6, 6]);
      const seen = new Set(Object.values(ui.windows).map(app => app.appId));
      const rerolling = actor.rerollFromMessage(message);
      await T.answer({ fields: { choice: "hero" }, button: "ok", seen }); // la repetición reutiliza las opciones: no hay segundo diálogo
      await rerolling;
      T.diceDone();
      T.eq(actor.system.heroPoint, 0, "gasta el punto de héroe");
      T.ok(/11/.test(T.messageText(T.lastMessage())), `nueva tirada 5 + 6: ${T.messageText(T.lastMessage())}`);
    })
  },
  {
    name: "Munición: disparar gasta y recargar vuelve al máximo",
    run: async ({ gm }) => gm.evaluate(async () => {
      const actor = await T.actor("character", T.hero({ skills: { ranged: { die: 6 } } }));
      const pistol = await T.give(actor, "basic-weapons", "Pistola", { "system.equipped": true });
      const max = pistol.system.ammo.max;
      T.ok(max > 0, "la pistola tiene cargador");
      await pistol.update({ "system.ammo.value": max });
      T.dice([6, 3], [6, 4]);
      await T.roll(() => actor.rollWeapon(pistol));
      T.diceDone();
      T.eq(actor.items.get(pistol.id).system.ammo.value, max - 1, "gasta 1");
      await actor.reloadWeapon(pistol);
      T.eq(actor.items.get(pistol.id).system.ammo.value, max, "recarga");
    })
  },
  {
    name: "Comprobación de creación: un personaje válido sale «Todo correcto»",
    run: async ({ gm }) => gm.evaluate(async () => {
      // 4 incrementos de características (d6/d6/d6/d6) y 15 de habilidades (d8 = 3, d6 = 2, d4 = 1).
      const actor = await T.actor("character", {
        attributes: { power: { die: 6 }, dexterity: { die: 6 }, mind: { die: 6 }, social: { die: 6 } },
        skills: { athletics: { die: 8 }, melee: { die: 8 }, ranged: { die: 8 }, diplomacy: { die: 8 }, stealth: { die: 6 }, medicine: { die: 4 } }
      });
      // Con el módulo fantástico y la regla de razas, el Humano recupera los 5 incrementos que cuestan las razas.
      if (game.settings.get("tdt", "module.fantasy")) await T.give(actor, "fantasy-races", "Humano");
      await actor.checkCreation();
      const text = T.messageText(T.lastMessage());
      T.ok(/Todo correcto/.test(text), text);
    })
  },
  {
    name: "Fuente de villano: el escape magistral exige 4 puntos y deja el resto como dificultad",
    run: async ({ gm }) => gm.evaluate(async () => {
      const villain = await T.actor("npc", { npcStats: { villain: { value: 9, max: 9 } } }, "Mike");
      await villain.spendVillain("escape");
      T.eq(villain.system.npcStats.villain.value, 8, "gasta 1");
      T.ok(/dificultad 8/.test(T.messageText(T.lastMessage())), "dificultad 8 para atraparlo");
      await villain.update({ "system.npcStats.villain.value": 3 });
      await villain.spendVillain("escape");
      T.ok(T.notes.some(note => /al menos 4 puntos/.test(note.message)), "con 3 no puede");
    })
  },
  {
    name: "Iniciativa conjunta: tira el mejor, los aliados bonifican y se alternan los turnos",
    run: async ({ gm }) => gm.evaluate(async () => {
      const a = await T.actor("character", T.hero(), "Ana");
      const b = await T.actor("character", { ...T.hero(), perception: { die: 4 } }, "Bea");
      const foe = await T.actor("npc", { initiative: { value: 6 } }, "Matón");
      const combat = await Combat.create({ active: true });
      await combat.createEmbeddedDocuments("Combatant", [a, b, foe].map(actor => ({ actorId: actor.id, name: actor.name })));
      T.dice([4, 4], [4, 1]); // 2d4 de Percepción: 4 + 1 = 5 (el bonifica 1 del aliado no cabe: ni en el 4 ni en el 1)
      const seen = new Set(Object.values(ui.windows).map(app => app.appId));
      const rolling = combat.rollAll();
      await T.answer({ seen }); // configuración de la iniciativa
      await T.answer({}); // tirada de Percepción
      await rolling;
      T.diceDone();
      const text = T.messageText(T.lastMessage());
      T.ok(/Héroes 5/.test(text) && /enemigos 6/.test(text), `héroes 5 contra enemigos 6: ${text}`);
      T.eq(combat.turns.map(turn => turn.name), ["Matón", "Ana", "Bea"], "empiezan los enemigos y luego los héroes");
      await combat.delete();
    })
  }
  ,
  {
    name: "Iniciativa: un personaje con el token hostil sigue siendo un héroe (y los nuevos nacen amistosos)",
    run: async ({ gm }) => gm.evaluate(async () => {
      const lucy = await T.actor("character", T.hero(), "Lucy");
      T.eq(lucy.prototypeToken.disposition, CONST.TOKEN_DISPOSITIONS.FRIENDLY, "un personaje nuevo nace amistoso");
      T.eq(lucy.prototypeToken.actorLink, true, "y enlazado a su ficha");
      const agent = await T.actor("npc", { initiative: { value: 6 } }, "Agente");
      const hostile = CONST.TOKEN_DISPOSITIONS.HOSTILE;
      // Lucy con el token hostil, como los que crea Foundry por defecto en mundos anteriores.
      const scene = await Scene.create({ name: "E2E iniciativa", tokens: [
        { name: "Lucy", actorId: lucy.id, actorLink: true, disposition: hostile, x: 0, y: 0 },
        { name: "Agente", actorId: agent.id, disposition: hostile, x: 100, y: 0 },
        { name: "Agente", actorId: agent.id, disposition: hostile, x: 200, y: 0 }
      ] });
      try {
        const combat = await Combat.create({ scene: scene.id, active: true });
        await combat.createEmbeddedDocuments("Combatant", scene.tokens.map(token => ({ tokenId: token.id, sceneId: scene.id, actorId: token.actorId, name: token.name })));
        T.dice([4, 4], [4, 4]); // Percepción 2d4 de Lucy: 4 + 4 y crítico = 12
        const seen = new Set(Object.values(ui.windows).map(app => app.appId));
        const rolling = combat.rollAll();
        await T.answer({ seen }); // configuración de la iniciativa
        await T.answer({}); // tirada de Percepción
        await rolling;
        T.diceDone();
        const text = T.messageText(T.lastMessage());
        T.ok(/Héroes 12/.test(text) && /enemigos 7/.test(text), `héroes 12 contra enemigos 6 + 1: ${text}`);
        T.ok(/Empieza el equipo de héroes/.test(text), `empiezan los héroes: ${text}`);
        T.eq(combat.turns.map(turn => turn.name), ["Lucy", "Agente", "Agente"], "Lucy y luego los agentes");
        await combat.delete();
      } finally {
        await scene.delete();
      }
    })
  },
  {
    name: "Defensa contra intrusión: Mente + Hacking, con un mínimo de 1d4 por el VirtualSelf",
    run: async ({ gm }) => gm.evaluate(async () => {
      const actor = await T.actor("character", T.hero());
      T.dice([6, 3], [4, 2]); // sin habilidad, el VS cuenta como d4
      const { value } = await T.roll(() => actor.rollHackDefense("hacking", { difficulty: 6 }));
      T.diceDone();
      T.eq(value.total, 5, "Mente d6 + Hacking d4 mínimo");
    })
  }
];
