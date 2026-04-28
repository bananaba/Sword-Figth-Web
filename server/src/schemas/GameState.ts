import { Schema, MapSchema, type } from "@colyseus/schema";

export class Vec3State extends Schema {
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") z = 0;
}

export class QuatState extends Schema {
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") z = 0;
  @type("number") w = 1;
}

export class PlayerState extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type(Vec3State) position = new Vec3State();
  @type(QuatState) rotation = new QuatState();
  @type(Vec3State) velocity = new Vec3State();
  @type("number") health = 100;
  @type("number") score = 0;
  @type("number") lastInputSeq = 0;
}

export class GameState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type("number") tick = 0;
}
