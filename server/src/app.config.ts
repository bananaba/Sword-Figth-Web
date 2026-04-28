import config from "@colyseus/tools";
import { monitor } from "@colyseus/monitor";
import express from "express";
import cors from "cors";
import { ROOM_NAME } from "@vibejam/shared";
import { GameRoom } from "./rooms/GameRoom";

export default config({
  initializeGameServer: (gameServer) => {
    gameServer.define(ROOM_NAME, GameRoom);
  },

  initializeExpress: (app) => {
    app.use(cors());
    app.use(express.json());

    app.get("/", (_req, res) => {
      res.json({ name: "vibejam-server", status: "ok" });
    });

    app.get("/healthz", (_req, res) => {
      res.json({ ok: true, ts: Date.now() });
    });

    app.use("/colyseus", monitor());
  },

  beforeListen: () => {
    // hook: warm caches, open db connection, etc.
  },
});
