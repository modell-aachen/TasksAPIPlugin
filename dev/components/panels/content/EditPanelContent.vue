<template>
<div class="edit-task-container">
<form v-if="taskToEdit">
    <div class="row">
        <div class="columns">
            <select-component :fields="taskToEdit.fields" field-name="Type"></select-component>
        </div>
        <div class="columns">
            <a class="primary button float-right" v-on:click="saveTask">{{maketext("Save entry")}}</a>
        </div>
    </div>
    <hr/>
    <div class="columns">
        <text-component :fields="taskToEdit.fields" field-name="Title" placeholder="Aufgabentitel"></text-component>
    </div>
    <hr/>
    <div class="columns">
        <task-editor-component :fields="taskToEdit.fields" field-name="Description"></task-editor-component>
    </div>
    <hr/>
    <h3 class="top-title">Details</h3>
    <hr/>
    <div class="row" v-for="fieldName in nonHiddenFieldsToShow">
        <div class="small-4 columns">{{getFieldDescription(fieldName)}}<sup v-if="isMandatoryField(fieldName)">*</sup>:</div>
        <div class="columns">
            <component :is="getComponentForField(fieldName)" :fields="taskToEdit.fields" :field-name="fieldName" :auto-assigns="autoAssigns">
            </component>
        </div>
    </div>
</form>
</div>
</template>

<script>
import TaskPanelMixin from "../../../mixins/TaskPanelMixin.vue";
import TextComponent from "../edit_components/TextComponent.vue";
import SelectComponent from "../edit_components/SelectComponent.vue";
import UserComponent from "../edit_components/UserComponent.vue";
import TaskEditorComponent from "../edit_components/TaskEditorComponent.vue";
import DateComponent from "../edit_components/DateComponent.vue";
import _ from 'lodash';
export default {
    data(){
        return {
            taskToEdit: null,
            autoAssigns: {}
        };
    },
    components: {
        TextComponent,
        SelectComponent,
        UserComponent,
        TaskEditorComponent,
        DateComponent
    },
    mixins: [TaskPanelMixin],
    computed: {
        nonHiddenFieldsToShow(){
            return this.fieldsToShow.filter((value) => {
                return !this.taskToEdit.fields[value].hidden;
            });
        }
    },
    methods: {
        recomputeAutoassigns(){
            let result = {};
            for(let fieldToChange in this.typeConfig.autoassign){
                let config = this.typeConfig.autoassign[fieldToChange];
                for(let fieldToWatch in config){
                    for(let i = 0; i < config[fieldToWatch].values.length; i++){
                        if(config[fieldToWatch].values[i] === this.taskToEdit.fields[fieldToWatch].value){
                            result[fieldToChange] = config[fieldToWatch].assign;
                        }
                    }
                }
            }
            this.autoAssigns = result;
        },
        saveTask(){
            //Check if all fields are valid
            for(let key in this.taskToEdit.fields){
                let isFieldValid = this.taskToEdit.fields[key].isValid;
                if(typeof isFieldValid !== 'undefined' && !isFieldValid){
                    this.taskToEdit.fields.showValidationWarnings = true;
                    return;
                }
            }
            let request = {
                form: this.taskToEdit.form
            };
            for(let key in this.taskToEdit.fields){
                let currentField = this.taskToEdit.fields[key];
                if(currentField.hasOwnProperty("value"))
                    request[key] = currentField.value;
            }
            if(this.isNewTaskEditMode){
                this.$store.dispatch("createNewTask", request);
            }
            else {
                request["id"] = this.taskToEdit.id;
                this.$store.dispatch("updateTask", {gridState: this.grid, request});
                this.$store.dispatch("switchEditMode", false);
            }
        },
        getComponentForField(fieldName){
            let fieldObject = this.taskToEdit.fields[fieldName];
            if(typeof fieldObject === 'undefined')
                return "missing-component";
            switch(fieldObject.type){
                case "text":
                    return "text-component";
                case "select":
                case "select+values":
                    return "select-component";
                case "user":
                case "user+multi":
                    return "user-component";
                case "date2":
                    return "date-component";
            }
        },
        isMandatoryField(fieldName){
            return this.taskToEdit.fields[fieldName].mandatory;
        },
        getFieldDescription(fieldName){
            return this.taskToEdit.fields[fieldName].description;
        }
    },
    watch: {
        task(){
            this.taskToEdit = _.cloneDeep(this.task);
        },
        "taskToEdit.fields": {
            deep: true,
            handler: function(){
                this.recomputeAutoassigns();
            }
        }
    },
    created(){
        this.taskToEdit = _.cloneDeep(this.task);
        this.$set(this.taskToEdit.fields, "showValidationWarnings", false);
    }
};
</script>

<style lang="sass">
.edit-task-container {
    margin: 5px;
}
</style>
