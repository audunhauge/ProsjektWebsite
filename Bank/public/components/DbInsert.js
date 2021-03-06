// @ts-check

(function() {
  const template = document.createElement("template");
  template.innerHTML = `
        <style>
        .heading {
            text-align: center;
            font-size: 1em;
            color: black;
            font-family: sans-serif;
            padding: 5px;
        }
        form {
            position: relative;
            top: 25px;
            width: 35em;
            max-width: 85%;
            padding: 5px;
            border: solid gray 1px;
            background-color: rgb(170, 170, 170, 0.8);
            margin-top: 1em;
        }

        form > label {
            position: relative;
            left: 70%;
        }
        
        form  div label {
            display: grid;
            grid-template-columns: 7fr 4fr;
            margin: 5px;
            padding: 5px;
            font-family: sans-serif;
            font-size: 0.9em;
            border: solid gray 1px;
            background-color: whitesmoke;
        }

        form  div#foreign label {
          grid-template-columns: 5fr 1fr 4fr;
        }

        form.invalid  {
          height: 1em;
          overflow:hidden;
        }
        
        form::after {
            color: black;
            position: absolute;
            right: 20px;
            top: -20px;
        }

        span.foreign {
          color: green;
          font-size: 0.9em;
          padding-right:3px;
        }
        
        #lagre {
            background-color: antiquewhite;
        }
        </style>
        <form>
          <div class="heading"><slot name="heading"></slot></div>
          <div id="fields"></div>
          <div id="foreign">
          </div>
          <div id="alien">
            <slot></slot>
          </div>
          <label> &nbsp; <button type="button" id="save"><slot name="save">Save</slot></button></label>
        </form>
    `;

  // extend to more datatypes if needed
  const getval = e => {
    switch (e.type) {
      case "checkbox":
        return e.checked;
      default:
        return e.value;
    }
  };

  class DBInsert extends HTMLElement {
    constructor() {
      super();
      this.table = "";
      this.fields = "";
      this._root = this.attachShadow({ mode: "open" });
      this.shadowRoot.appendChild(template.content.cloneNode(true));
      // this is code for creating sql insert statement
      this._root.querySelector("#save").addEventListener("click", e => {
        // aliens will pick out any db-foreign placed into alien-slot
        let aliens = Array.from(this._root.querySelectorAll("#alien slot"))
          .map(e => e.assignedElements()[0])
          .filter(e => e !== undefined);
        let foreign = Array.from(
          this._root.querySelectorAll("#foreign select")
        );
        let inputs = Array.from(this._root.querySelectorAll("#fields input"))
          .concat(foreign)
          .concat(aliens);
        let names = inputs.map(e => e.id);
        let valueList = names.map(e => `$[${e}]`).join(",");
        let namelist = names.join(",");
        // get value of input element - handles checkboxes
        let data = inputs.reduce((s, e) => ((s[e.id] = getval(e)), s), {});
        let table = this.table;
        let sql = `insert into ${table} (${namelist}) values (${valueList})`;
        this.upsert(sql, data);
      });
    }

    static get observedAttributes() {
      return ["table", "fields", "foreign", "connected"];
    }

    connectedCallback() {
      console.log(this.table);
    }

    makeform(fields) {
      let divFields = this._root.querySelector("#fields");
      divFields.innerHTML = "";
      let fieldlist = fields.split(",");
      for (let i = 0; i < fieldlist.length; i++) {
        let [name, type = "text", text = ""] = fieldlist[i].split(":");
        text = (t => t.charAt(0).toUpperCase() + t.substr(1))(text || name);
        let label = document.createElement("label");
        label.innerHTML = `${text} <input type="${type}" id="${name}">`;
        divFields.appendChild(label);
      }
    }

    attributeChangedCallback(name, oldValue, newValue) {
      let divFields = this._root.querySelector("#fields");
      let divForeign = this._root.querySelector("#foreign");
      if (name === "fields") {
        this.fields = newValue;
        this.makeform(this.fields);
      }
      if (name === "table") {
        this.table = newValue;
      }
      if (name === "connected") {
        this.connected = newValue;
        // this component depends on another
        addEventListener("dbUpdate", e => {
          let source = e.detail.source;
          let [id, field] = this.connected.split(":");
          if (id !== source) return; // we are not interested
          let dbComponent = document.getElementById(id);
          if (dbComponent) {
            this.makeform(this.fields);
            // component found - get its value
            let value = dbComponent.value || "";
            if (value !== "") {
              let label = document.createElement("label");
              label.innerHTML = `${field} <input disabled type="text" id="${field}" value="${value}">`;
              divFields.appendChild(label);
              this._root.querySelector("form").classList.remove("invalid");
            } else {
              // we must redraw as empty
              this._root.querySelector("form").classList.add("invalid");
              this.idx = undefined;
              this.trigger({}); // cascade
            }
          }
        });
      }
      if (name === "foreign") {
        divForeign.innerHTML = "";
        let fieldlist = newValue.split(",");
        for (let i = 0; i < fieldlist.length; i++) {
          let [table, fields] = fieldlist[i].split(".");
          let [field, use] = fields.split(":");
          use = (use || field).replace("+", ",");
          let text = table.charAt(0).toUpperCase() + table.substr(1);
          let label = document.createElement("label");
          label.innerHTML = `${text} <span class="foreign">${field} </span> <select id="${field}"></select>`;
          divForeign.appendChild(label);
          this.makeSelect(table, field, use);
        }
      }
    }

    trigger(detail) {
      detail.source = this.id;
      this.dispatchEvent(
        new CustomEvent("dbUpdate", {
          bubbles: true,
          composed: true,
          detail
        })
      );
    }

    // assumes foreign key has same name in both tables
    // bok.forfatterid references forfatter.forfatterid
    makeSelect(table, field, use) {
      let fields = field === use ? field : `${field}, ${use}`;
      let sql = `select ${fields} from ${table} order by ${use}`;
      let data = "";
      let init = {
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ sql, data }),
        headers: {
          "Content-Type": "application/json"
        }
      };
      fetch("/runsql", init)
        .then(r => r.json())
        .then(data => {
          console.log(data);
          let list = data.results;
          let labels = use.split(",");
          if (list.length) {
            let options = list
              .map(
                e =>
                  `<option value="${e[field]}">${labels
                    .map(l => e[l])
                    .join(" ")}</option>`
              )
              .join("");
            this._root.querySelector(`#${field}`).innerHTML = options;
          }
        });
      //.catch(e => console.log(e.message));
    }

    upsert(sql = "", data) {
      let init = {
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ sql, data }),
        headers: {
          "Content-Type": "application/json"
        }
      };
      console.log(sql, data);
      fetch("/runsql", init)
        .then(
          () =>
            this.trigger({ table: this.table, insert: true })
        )
        .catch(e => console.log(e.message));
    }
  }

  window.customElements.define("db-insert", DBInsert);
})();
