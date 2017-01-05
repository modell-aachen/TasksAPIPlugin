<template>
<div v-if="taskToEdit">
    <select-component :fields="taskToEdit.fields" field-name="Type"></select-component>
    <user-component :fields="taskToEdit.fields" field-name="AssignedTo"></user-component>
    <text-component :fields="taskToEdit.fields" field-name="Title" placeholder="Aufgabentitel"></text-component>
    <task-editor-component :fields="taskToEdit.fields" field-name="Description"></task-editor-component>
    <component v-for="fieldName in fieldsToShow" :is="getComponentForField(fieldName)" :fields="taskToEdit.fields" :fieldName="fieldName"></component>
    <a class="button" v-on:click="saveTask">Save</a>
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
            taskToEdit: null
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
    methods: {
        saveTask(){
            let request = {
                form: this.taskToEdit.form
            };
            for(let key in this.taskToEdit.fields){
                let currentField = this.taskToEdit.fields[key];
                request[key] = currentField.value;
            }
            if(this.taskToEdit.isNew){
                this.$store.dispatch("createNewTask", request);
            }
            else {
                request["id"] = this.taskToEdit.id;
                this.$store.dispatch("updateTask", {gridState: this.grid, request});
            }
        },
        getComponentForField(fieldName){
            let fieldObject = this.taskToEdit.fields[fieldName];
            if(typeof fieldObject === 'undefined')
                return "missing-component"
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
        }
    },
    created(){
        this.taskToEdit = _.cloneDeep(this.task);
    },
    mounted(){
    }
};
</script>

<style lang="sass">
</style>
